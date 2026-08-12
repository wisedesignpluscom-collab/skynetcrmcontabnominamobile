import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getPortalAuthSecret, PORTAL_JWT_ALG } from "./portalAuthSecret";

const COOKIE_NAME = "skynet_portal_session";
// Más corto que los 7 días del CRM interno: es una superficie expuesta a
// internet con datos de clientes de terceros.
const SESSION_DAYS = 1;

function secret() {
  return getPortalAuthSecret();
}

function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

// Solo claims INMUTABLES de un PortalUser (nunca cambia de empresa). Todo lo
// mutable (active, mustChangePassword) se re-verifica contra la BD en cada
// carga de página del portal (app/portal/layout.tsx) — nunca se confía en el
// JWT para eso, así una desactivación surte efecto de inmediato.
export type PortalSessionUser = {
  id: string;
  companyId: string;
  name: string;
  email: string;
};

export async function createPortalSession(user: PortalSessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: PORTAL_JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    maxAge: SESSION_DAYS * 86400,
    // Scoping extra que el CRM interno no tiene: el navegador ni siquiera
    // envía esta cookie fuera de /portal.
    path: "/portal",
  });
}

export async function getPortalSession(): Promise<PortalSessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [PORTAL_JWT_ALG] });
    return {
      id: payload.id as string,
      companyId: payload.companyId as string,
      name: payload.name as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

export async function destroyPortalSession() {
  const cookieStore = await cookies();
  cookieStore.delete({ name: COOKIE_NAME, path: "/portal" });
}

export { COOKIE_NAME as PORTAL_COOKIE_NAME };
