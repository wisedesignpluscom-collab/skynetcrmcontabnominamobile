// Motor de envío de correo por SMTP (server-only: importa nodemailer).
// - sendTestEmail: prueba la configuración enviando un correo de una vez.
// - sendPendingEmails: drena EmailOutbox (correos programados cuya hora llegó),
//   con reclamo atómico para no enviar dos veces y reintentos acotados.

import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { getSmtpConfig, type SmtpConfig } from "./smtp";

const MAX_ATTEMPTS = 3;

async function buildTransport(): Promise<{ transport: nodemailer.Transporter; cfg: SmtpConfig } | null> {
  const cfg = await getSmtpConfig();
  if (!cfg) return null;
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  return { transport, cfg };
}

function fromHeader(cfg: SmtpConfig): string {
  const email = cfg.fromEmail || cfg.user;
  return cfg.fromName ? `"${cfg.fromName}" <${email}>` : email;
}

// Anti-inyección de cabeceras: un asunto/destinatario con saltos de línea podría
// inyectar cabeceras SMTP. Nodemailer ya protege, pero limpiamos por si acaso.
function stripCRLF(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

// Envía un correo de prueba de inmediato (para validar la configuración).
export async function sendTestEmail(to: string): Promise<void> {
  const tr = await buildTransport();
  if (!tr) throw new Error("Primero configura el SMTP.");
  await tr.transport.sendMail({
    from: fromHeader(tr.cfg),
    to: stripCRLF(to),
    subject: "Correo de prueba — Nogui CRM",
    html: "<p>¡Funciona! 🎉</p><p>Este es un correo de prueba enviado desde <b>Nogui CRM</b>. Si lo recibiste, la configuración SMTP está correcta.</p>",
  });
}

// Evita dos drenados simultáneos en el mismo proceso
let draining = false;

// Envía los correos pendientes cuya hora programada ya llegó.
export async function sendPendingEmails(limit = 20): Promise<{ sent: number; failed: number }> {
  if (draining) return { sent: 0, failed: 0 };
  const tr = await buildTransport();
  if (!tr) return { sent: 0, failed: 0 }; // sin SMTP configurado: quedan pendientes

  draining = true;
  try {
    const pending = await prisma.emailOutbox.findMany({
      where: { status: "pendiente", scheduledFor: { lte: new Date() } },
      orderBy: { scheduledFor: "asc" },
      take: limit,
    });

    let sent = 0;
    let failed = 0;
    for (const mail of pending) {
      // Reclamo atómico: solo un consumidor pasa el pendiente → enviando
      const claimed = await prisma.emailOutbox.updateMany({
        where: { id: mail.id, status: "pendiente" },
        data: { status: "enviando" },
      });
      if (claimed.count === 0) continue;

      try {
        await tr.transport.sendMail({
          from: fromHeader(tr.cfg),
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
