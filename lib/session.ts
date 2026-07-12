import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "nogui_session";
const SESSION_DAYS = 7;

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

// La cookie de sesión es "secure" (solo HTTPS) en producción. En una instalación
// en red local por HTTP plano hay que desactivarlo con COOKIE_SECURE=false, si no
// el navegador no guarda la cookie y el login "no entra". En la nube (HTTPS) se
// deja el valor por defecto o COOKIE_SECURE=true.
function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    maxAge: SESSION_DAYS * 86400,
    path: "/",
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: payload.id as string,
      name: payload.name as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
