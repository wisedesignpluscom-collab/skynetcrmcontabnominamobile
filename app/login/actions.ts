"use server";

import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { checkRateLimit, resetRateLimit } from "@/lib/rateLimit";

// Hash "señuelo" para gastar el mismo tiempo cuando el email no existe (evita
// deducir por el tiempo de respuesta qué correos están registrados).
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8b8xdq9Xk1s3v4t5u6w7x8y9z0A1Bu";

const MAX_ATTEMPTS = 8; // por ventana
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

// Bloqueo persistente en BD (además del rate-limit en memoria de arriba, que
// se pierde si el proceso reinicia o hay varias instancias en la nube) —
// espejo exacto del que ya tiene el portal de clientes en lib/portal.ts.
const MAX_INTENTOS_FALLIDOS = 6;
const BLOQUEO_MS = 15 * 60 * 1000; // 15 minutos

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "Escribe tu email y contraseña." };

  // Freno de fuerza bruta: por email y por IP
  const ip = await clientIp();
  const byEmail = checkRateLimit(`login:email:${email}`, MAX_ATTEMPTS, WINDOW_MS);
  const byIp = checkRateLimit(`login:ip:${ip}`, MAX_ATTEMPTS * 4, WINDOW_MS);
  if (!byEmail.allowed || !byIp.allowed) {
    const wait = Math.max(byEmail.retryAfterSec, byIp.retryAfterSec);
    return { error: `Demasiados intentos. Espera ${Math.ceil(wait / 60)} minuto(s) e intenta de nuevo.` };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutos = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `Acceso bloqueado por intentos fallidos. Intenta en ${minutos} minuto(s).` };
  }

  // Siempre comparamos un hash (real o señuelo) para que el tiempo no delate
  // si el usuario existe.
  const valid =
    (await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)) && !!user && user.active;

  if (!valid || !user) {
    if (user) {
      const intentos = user.failedAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: intentos,
          lockedUntil:
            intentos >= MAX_INTENTOS_FALLIDOS ? new Date(Date.now() + BLOQUEO_MS) : user.lockedUntil,
        },
      });
    }
    return { error: "Email o contraseña incorrectos." };
  }

  // Login correcto: se limpia el contador de ese email y el bloqueo persistente
  resetRateLimit(`login:email:${email}`);
  await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
  await createSession({ id: user.id, name: user.name, email: user.email, role: user.role });
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
