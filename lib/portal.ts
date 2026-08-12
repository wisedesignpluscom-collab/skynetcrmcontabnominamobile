// Alcance, re-verificación de sesión y login del portal de clientes
// (server-only, usa Prisma) — equivalente de lib/permissions.ts +
// lib/ownership.ts pero para el portal: un PortalUser solo tiene una empresa,
// así que el "scope" es trivial.
//
// Deliberadamente separado en funciones que NO tocan cookies()/redirect()
// (resolvePortalAuth, attemptPortalLogin) de los wrappers finos que sí lo
// hacen (requirePortalUser en este archivo, loginPortal en
// app/portal/login/actions.ts) — mismo principio que canAccessCompany
// recibiendo la sesión ya resuelta en vez de leerla ella misma. Así la lógica
// se puede probar con tests/portal.test.ts sin el runtime de Next.
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { getPortalSession, type PortalSessionUser } from "./portalSession";

// Fragmento `where` de Prisma para cualquier consulta del portal — companyId
// siempre sale de la sesión ya verificada, nunca de un parámetro de la URL.
export function portalCompanyScope(session: PortalSessionUser) {
  return { companyId: session.companyId };
}

export type PortalAuthState =
  | { status: "anon" }
  | { status: "blocked" }
  | { status: "must_change_password"; session: PortalSessionUser; companyName: string }
  | { status: "ok"; session: PortalSessionUser; companyName: string };

// Re-verifica `active`/`mustChangePassword` contra la BD: son claims mutables
// que el JWT no debe decidir por sí solo — si el gestor desactiva el acceso,
// debe cortar de inmediato, no cuando expire el token de hasta 1 día.
export async function resolvePortalAuth(
  session: PortalSessionUser | null
): Promise<PortalAuthState> {
  if (!session) return { status: "anon" };

  const record = await prisma.portalUser.findUnique({
    where: { id: session.id },
    select: { active: true, mustChangePassword: true, company: { select: { name: true } } },
  });
  if (!record || !record.active) return { status: "blocked" };
  if (record.mustChangePassword) {
    return { status: "must_change_password", session, companyName: record.company.name };
  }
  return { status: "ok", session, companyName: record.company.name };
}

export async function requirePortalUser(): Promise<PortalAuthState> {
  return resolvePortalAuth(await getPortalSession());
}

// ── Login (sin cookies()/redirect(): eso lo hace loginPortal) ───────────────

const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8b8xdq9Xk1s3v4t5u6w7x8y9z0A1Bu";
export const MAX_INTENTOS_FALLIDOS = 6;
export const BLOQUEO_MS = 15 * 60 * 1000; // 15 minutos

export type PortalLoginResult =
  | { ok: true; user: PortalSessionUser & { mustChangePassword: boolean } }
  | { ok: false; error: string };

// Bloqueo persistente en BD (además del rate-limit en memoria de
// lib/rateLimit.ts, que se pierde si el proceso reinicia): el portal es una
// superficie expuesta a internet con datos de terceros. Siempre compara un
// hash (real o señuelo) para que el tiempo de respuesta no delate si el email
// existe, y nunca revela si el rechazo fue por clave, cuenta inactiva o
// bloqueo por intentos — mismo mensaje genérico en todos los casos salvo el
// bloqueo explícito (que sí conviene decir, para que el cliente no reintente
// en bucle).
export async function attemptPortalLogin(
  emailCrudo: string,
  password: string
): Promise<PortalLoginResult> {
  const email = emailCrudo.trim().toLowerCase();
  const user = await prisma.portalUser.findUnique({ where: { email } });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutos = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { ok: false, error: `Acceso bloqueado por intentos fallidos. Intenta en ${minutos} minuto(s).` };
  }

  const valid =
    (await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)) && !!user && user.active;

  if (!valid || !user) {
    if (user) {
      const intentos = user.failedAttempts + 1;
      await prisma.portalUser.update({
        where: { id: user.id },
        data: {
          failedAttempts: intentos,
          lockedUntil:
            intentos >= MAX_INTENTOS_FALLIDOS ? new Date(Date.now() + BLOQUEO_MS) : user.lockedUntil,
        },
      });
    }
    return { ok: false, error: "Email o contraseña incorrectos." };
  }

  await prisma.portalUser.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  return {
    ok: true,
    user: {
      id: user.id,
      companyId: user.companyId,
      name: user.name,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
    },
  };
}
