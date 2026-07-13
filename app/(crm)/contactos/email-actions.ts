"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { renderTemplate } from "@/lib/engine/actions";
import { revalidatePath } from "next/cache";

export type SendEmailInput = {
  contactId: string;
  templateId?: string;
  // Cuenta remitente elegida; vacío = usar la predeterminada
  accountId?: string;
  subject?: string;
  body?: string;
  // ISO local (input datetime-local) o vacío = enviar de inmediato
  scheduledFor?: string;
};

export type SendEmailResult = { ok: boolean; error?: string; scheduled?: boolean };

// Encola un correo (a la bandeja de salida) para un contacto: con plantilla o
// escrito a mano, para enviar ahora o en una fecha/hora. El envío real lo hace
// el motor SMTP (mailer) cuando llega la hora.
export async function sendEmailToContact(input: SendEmailInput): Promise<SendEmailResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sesión no válida." };

  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
    include: { company: true, owner: true },
  });
  if (!contact) return { ok: false, error: "El contacto ya no existe." };
  if (!contact.email || !contact.email.includes("@"))
    return { ok: false, error: "El contacto no tiene un correo válido." };

  const record = contact as unknown as Record<string, unknown>;

  let subject = "";
  let body = "";
  if (input.templateId) {
    const tpl = await prisma.emailTemplate.findUnique({ where: { id: input.templateId } });
    if (!tpl) return { ok: false, error: "La plantilla ya no existe." };
    subject = renderTemplate(tpl.subject, record).trim();
    body = renderTemplate(tpl.bodyHtml, record);
  } else {
    subject = renderTemplate((input.subject ?? "").trim(), record).trim();
    body = renderTemplate(input.body ?? "", record);
  }
  if (!subject) return { ok: false, error: "Falta el asunto (o elegir una plantilla)." };

  // Fecha programada: interpreta el datetime-local como hora local del servidor
  let scheduledFor = new Date();
  if (input.scheduledFor) {
    const d = new Date(input.scheduledFor);
    if (!Number.isNaN(d.getTime())) scheduledFor = d;
  }
  const scheduled = scheduledFor.getTime() > Date.now() + 30_000;

  await prisma.emailOutbox.create({
    data: { to: contact.email, subject, body, scheduledFor, accountId: input.accountId || null },
  });

  await prisma.activity.create({
    data: {
      type: "email",
      content: scheduled
        ? `Correo programado para ${scheduledFor.toLocaleString("es-VE")}: "${subject}"`
        : `Correo enviado: "${subject}"`,
      contactId: contact.id,
    },
  });

  revalidatePath(`/contactos/${contact.id}`);
  return { ok: true, scheduled };
}
