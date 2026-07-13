// Motor de envío de correo por SMTP (server-only: importa nodemailer).
// - sendTestEmail: prueba una cuenta enviando un correo de una vez.
// - sendPendingEmails: drena EmailOutbox (correos programados cuya hora llegó),
//   con reclamo atómico para no enviar dos veces y reintentos acotados. Cada
//   correo se envía desde su cuenta (accountId) o desde la predeterminada.

import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { getSendingAccount } from "./accounts";
import type { EmailAccount } from "@prisma/client";

const MAX_ATTEMPTS = 3;

function transportFor(acc: EmailAccount): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: acc.host,
    port: acc.port,
    secure: acc.secure,
    auth: { user: acc.user, pass: acc.pass },
  });
}

function fromHeader(acc: EmailAccount): string {
  const email = acc.fromEmail || acc.user;
  return acc.fromName ? `"${acc.fromName}" <${email}>` : email;
}

// Anti-inyección de cabeceras: un asunto/destinatario con saltos de línea podría
// inyectar cabeceras SMTP. Nodemailer ya protege, pero limpiamos por si acaso.
function stripCRLF(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

// Envía un correo de prueba de inmediato desde una cuenta (para validarla).
export async function sendTestEmail(to: string, accountId?: string): Promise<void> {
  const acc = await getSendingAccount(accountId);
  if (!acc) throw new Error("Primero configura una cuenta de correo.");
  await transportFor(acc).sendMail({
    from: fromHeader(acc),
    to: stripCRLF(to),
    subject: "Correo de prueba — Skynet CRM",
    html: `<p>¡Funciona! 🎉</p><p>Este es un correo de prueba enviado desde <b>Skynet CRM</b> con la cuenta <b>${acc.label}</b>. Si lo recibiste, la configuración es correcta.</p>`,
  });
}

// Evita dos drenados simultáneos en el mismo proceso
let draining = false;

// Envía los correos pendientes cuya hora programada ya llegó.
export async function sendPendingEmails(limit = 20): Promise<{ sent: number; failed: number }> {
  if (draining) return { sent: 0, failed: 0 };
  // Sin ninguna cuenta activa: los correos quedan pendientes hasta que se configure
  if (!(await getSendingAccount())) return { sent: 0, failed: 0 };

  draining = true;
  try {
    const pending = await prisma.emailOutbox.findMany({
      where: { status: "pendiente", scheduledFor: { lte: new Date() } },
      orderBy: { scheduledFor: "asc" },
      take: limit,
    });

    // Cachés por drenado: cuenta resuelta y transporte por cuenta.
    const accByKey = new Map<string, EmailAccount | null>();
    const transportByAccount = new Map<string, nodemailer.Transporter>();
    const resolveAccount = async (accountId: string | null) => {
      const key = accountId ?? "__default__";
      if (!accByKey.has(key)) accByKey.set(key, await getSendingAccount(accountId));
      return accByKey.get(key) ?? null;
    };

    let sent = 0;
    let failed = 0;
    for (const mail of pending) {
      // Reclamo atómico: solo un consumidor pasa el pendiente → enviando
      const claimed = await prisma.emailOutbox.updateMany({
        where: { id: mail.id, status: "pendiente" },
        data: { status: "enviando" },
      });
      if (claimed.count === 0) continue;

      const acc = await resolveAccount(mail.accountId);
      if (!acc) {
        // No hay cuenta para enviarlo: vuelve a pendiente y se reintenta luego
        await prisma.emailOutbox.update({
          where: { id: mail.id },
          data: { status: "pendiente" },
        });
        continue;
      }

      let transport = transportByAccount.get(acc.id);
      if (!transport) {
        transport = transportFor(acc);
        transportByAccount.set(acc.id, transport);
      }

      try {
        await transport.sendMail({
          from: fromHeader(acc),
          to: stripCRLF(mail.to),
          subject: stripCRLF(mail.subject),
          html: mail.body,
        });
        await prisma.emailOutbox.update({
          where: { id: mail.id },
          data: { status: "enviado", sentAt: new Date(), error: null },
        });
        sent++;
      } catch (err) {
        const attempts = mail.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        await prisma.emailOutbox.update({
          where: { id: mail.id },
          // Agotó reintentos → error definitivo; si no, vuelve a pendiente para reintentar
          data:
            attempts >= MAX_ATTEMPTS
              ? { status: "error", attempts, error: message }
              : { status: "pendiente", attempts, error: message },
        });
        failed++;
      }
    }
    return { sent, failed };
  } finally {
    draining = false;
  }
}
