"use server";

import { createPortalSession, destroyPortalSession } from "@/lib/portalSession";
import { attemptPortalLogin } from "@/lib/portal";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_ATTEMPTS = 8; // rate-limit en memoria, por ventana
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

export async function loginPortal(_prev: { error?: string } | undefined, formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "Escribe tu email y contraseña." };

  const ip = await clientIp();
  const byEmail = checkRateLimit(`portal-login:email:${email}`, MAX_ATTEMPTS, WINDOW_MS);
  const byIp = checkRateLimit(`portal-login:ip:${ip}`, MAX_ATTEMPTS * 4, WINDOW_MS);
  if (!byEmail.allowed || !byIp.allowed) {
    const wait = Math.max(byEmail.retryAfterSec, byIp.retryAfterSec);
    return { error: `Demasiados intentos. Espera ${Math.ceil(wait / 60)} minuto(s) e intenta de nuevo.` };
  }

  const result = await attemptPortalLogin(email, password);
  if (!result.ok) return { error: result.error };

  await createPortalSession(result.user);
  redirect(result.user.mustChangePassword ? "/portal/cuenta" : "/portal");
}

export async function logoutPortal() {
  await destroyPortalSession();
  redirect("/portal/login");
}
