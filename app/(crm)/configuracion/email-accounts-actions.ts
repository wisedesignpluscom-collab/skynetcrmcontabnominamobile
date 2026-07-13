"use server";

import { getSession } from "@/lib/session";
import {
  createAccount,
  updateAccount,
  deleteAccount,
  setDefaultAccount,
  type EmailAccountInput,
} from "@/lib/email/accounts";
import { sendTestEmail } from "@/lib/email/mailer";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") throw new Error("Solo un administrador.");
  return session;
}

export type AccountFormInput = {
  id?: string;
  label: string;
  host: string;
  port: string;
  secure: boolean;
  user: string;
  pass: string; // en edición: vacío = conservar la guardada
  fromName: string;
  fromEmail: string;
};

export type ActionFeedback = { ok: boolean; error?: string };

function normalize(
  input: AccountFormInput
): { data: EmailAccountInput } | { error: string } {
  const label = input.label.trim();
  const host = input.host.trim();
  const user = input.user.trim();
  if (!label) return { error: "Ponle una etiqueta a la cuenta (ej. «Ventas»)." };
  if (!host || !user)
    return { error: "El servidor (host) y el usuario son obligatorios." };
  const port = Number(input.port) || 587;
  return {
    data: {
      label,
      host,
      port,
      secure: input.secure,
      user,
      pass: input.pass,
      fromName: input.fromName.trim(),
      fromEmail: input.fromEmail.trim() || user,
    },
  };
}

// Crea (sin id) o actualiza (con id) una cuenta de correo.
export async function saveEmailAccount(input: AccountFormInput): Promise<ActionFeedback> {
  await requireAdmin();
  const n = normalize(input);
  if ("error" in n) return { ok: false, error: n.error };

  if (input.id) {
    await updateAccount(input.id, n.data);
  } else {
    if (!n.data.pass.trim())
      return { ok: false, error: "Falta la contraseña del correo (o de aplicación)." };
    await createAccount(n.data);
  }
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function removeEmailAccount(id: string): Promise<ActionFeedback> {
  await requireAdmin();
  await deleteAccount(id);
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function makeDefaultEmailAccount(id: string): Promise<ActionFeedback> {
  await requireAdmin();
  await setDefaultAccount(id);
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function testEmailAccount(id: string, to: string): Promise<ActionFeedback> {
  await requireAdmin();
  const dest = to.trim();
  if (!dest.includes("@")) return { ok: false, error: "Escribe un correo de destino válido." };
  try {
    await sendTestEmail(dest, id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." };
  }
}
