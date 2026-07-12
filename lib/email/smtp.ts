// Configuración SMTP del correo saliente, guardada en AppSetting (clave "smtp").
// Módulo liviano (sin nodemailer) para poder leerlo desde cualquier lado; el
// envío real vive en mailer.ts.

import { prisma } from "@/lib/prisma";

const KEY = "smtp";

export type SmtpConfig = {
  host: string;
  port: number;
  // true = SSL directo (465); false = STARTTLS (587)
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
};

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  try {
    const c = JSON.parse(row.value) as SmtpConfig;
    if (c && c.host && c.user) return c;
  } catch {
    // valor corrupto: se reconfigura
  }
  return null;
}

export async function saveSmtpConfig(cfg: SmtpConfig): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(cfg) },
    create: { key: KEY, value: JSON.stringify(cfg) },
  });
}

export async function isSmtpConfigured(): Promise<boolean> {
  return (await getSmtpConfig()) !== null;
}
