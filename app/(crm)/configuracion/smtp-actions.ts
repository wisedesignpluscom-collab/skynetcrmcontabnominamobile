"use server";

import { getSession } from "@/lib/session";
import { getSmtpConfig, saveSmtpConfig, type SmtpConfig } from "@/lib/email/smtp";
import { sendTestEmail } from "@/lib/email/mailer";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") throw new Error("Solo un administrador.");
  return session;
}

export type SmtpInput = {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  pass: string; // vacío = conservar la guardada
  fromName: string;
  fromEmail: string;
};

export type ActionFeedback = { ok: boolean; error?: string };

export async function saveSmtp(input: SmtpInput): Promise<ActionFeedback> {
  await requireAdmin();

  const host = input.host.trim();
  const user = input.user.trim();
  const port = Number(input.port) || 587;
  if (!host || !user) return { ok: false, error: "El servidor (host) y el usuario son obligatorios." };

  // Clave write-only: si el campo llega vacío, se conserva la ya guardada
  const existing = await getSmtpConfig();
  const pass = input.pass.trim() || existing?.pass || "";
  if (!pass) return { ok: false, error: "Falta la contraseña del correo (o de aplicación)." };

  const cfg: SmtpConfig = {
    host,
    port,
    secure: input.secure,
    user,
    pass,
    fromName: input.fromName.trim(),
    fromEmail: input.fromEmail.trim() || user,
  };
  await saveSmtpConfig(cfg);
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function testSmtp(to: string): Promise<ActionFeedback> {
  await requireAdmin();
  const dest = to.trim();
  if (!dest.includes("@")) return { ok: false, error: "Escribe un correo de destino válido." };
  try {
    await sendTestEmail(dest);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." };
  }
}
