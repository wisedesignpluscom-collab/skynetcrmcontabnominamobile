// Cuentas de correo saliente (SMTP). Módulo liviano (sin nodemailer) para poder
// leerse desde cualquier lado; el envío real vive en mailer.ts.
// Reemplaza al antiguo AppSetting único "smtp" (lib/email/smtp.ts).

import { prisma } from "@/lib/prisma";
import type { EmailAccount } from "@prisma/client";

export type EmailAccountInput = {
  label: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string; // en actualización: vacío = conservar la guardada
  fromName: string;
  fromEmail: string;
};

// La cuenta con la que se enviará un correo:
//  1) la pedida por id (si existe y está activa),
//  2) si no, la predeterminada activa,
//  3) si no, la primera activa que exista.
// null si no hay ninguna cuenta activa configurada.
export async function getSendingAccount(
  id?: string | null
): Promise<EmailAccount | null> {
  if (id) {
    const acc = await prisma.emailAccount.findUnique({ where: { id } });
    if (acc && acc.active) return acc;
    // Si la pedida ya no existe o está inactiva, cae a la predeterminada.
  }
  const def = await prisma.emailAccount.findFirst({
    where: { active: true, isDefault: true },
  });
  if (def) return def;
  return prisma.emailAccount.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function hasSendingAccount(): Promise<boolean> {
  return (await prisma.emailAccount.count({ where: { active: true } })) > 0;
}

// Todas las cuentas (para el panel de configuración y los selectores).
export async function listAccounts(): Promise<EmailAccount[]> {
  return prisma.emailAccount.findMany({
    orderBy: [{ isDefault: "desc" }, { label: "asc" }],
  });
}

// Cuentas activas en formato {value,label} para los selectores "Enviar desde".
export async function accountOptions(): Promise<
  { value: string; label: string; isDefault: boolean }[]
> {
  const accs = await prisma.emailAccount.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { label: "asc" }],
  });
  return accs.map((a) => ({
    value: a.id,
    label: a.fromEmail ? `${a.label} · ${a.fromEmail}` : a.label,
    isDefault: a.isDefault,
  }));
}

export async function createAccount(input: EmailAccountInput): Promise<EmailAccount> {
  // Si es la primera cuenta, queda como predeterminada automáticamente.
  const count = await prisma.emailAccount.count();
  const created = await prisma.emailAccount.create({
    data: {
      label: input.label,
      host: input.host,
      port: input.port,
      secure: input.secure,
      user: input.user,
      pass: input.pass,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      isDefault: count === 0,
    },
  });
  return created;
}

export async function updateAccount(
  id: string,
  input: EmailAccountInput
): Promise<EmailAccount> {
  // Contraseña write-only: vacío = conservar la que ya está guardada.
  const data: Record<string, unknown> = {
    label: input.label,
    host: input.host,
    port: input.port,
    secure: input.secure,
    user: input.user,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
  };
  if (input.pass.trim()) data.pass = input.pass;
  return prisma.emailAccount.update({ where: { id }, data });
}

// Marca una cuenta como predeterminada (y desmarca las demás) en una transacción.
export async function setDefaultAccount(id: string): Promise<void> {
  await prisma.$transaction([
    prisma.emailAccount.updateMany({
      where: { id: { not: id } },
      data: { isDefault: false },
    }),
    prisma.emailAccount.update({
      where: { id },
      data: { isDefault: true, active: true },
    }),
  ]);
}

// Elimina una cuenta. Si era la predeterminada, asciende otra activa.
export async function deleteAccount(id: string): Promise<void> {
  const acc = await prisma.emailAccount.findUnique({ where: { id } });
  if (!acc) return;
  await prisma.emailAccount.delete({ where: { id } });
  if (acc.isDefault) {
    const next = await prisma.emailAccount.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await prisma.emailAccount.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }
}
