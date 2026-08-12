import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getAuthSecret, JWT_ALG } from "@/lib/authSecret";
import { getPortalAuthSecret, PORTAL_JWT_ALG } from "@/lib/portalAuthSecret";

const COOKIE_NAME = "skynet_session";
const PORTAL_COOKIE_NAME = "skynet_portal_session";

// El portal de clientes es un sistema aparte: cookie, secreto y JWT propios —
// un token de un sistema nunca sirve para autenticarse en el otro. Por eso
// bifurca por prefijo de ruta en vez de compartir la lógica del CRM interno.
async function proxyPortal(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (pathname === "/portal/login") return NextResponse.next();

  const token = req.cookies.get(PORTAL_COOKIE_NAME)?.value;
  if (token) {
    try {
      await jwtVerify(token, getPortalAuthSecret(), { algorithms: [PORTAL_JWT_ALG] });
      return NextResponse.next();
    } catch {
      // Token inválido o expirado: cae al redirect de abajo
    }
  }
  return NextResponse.redirect(new URL("/portal/login", req.url));
}

async function proxyInterno(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      await jwtVerify(token, getAuthSecret(), { algorithms: [JWT_ALG] });
      return NextResponse.next();
    } catch {
      // Token inválido o expirado: cae al redirect de abajo
    }
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/portal")) return proxyPortal(req);
  return proxyInterno(req);
}

export const config = {
  // Protege todo excepto login, el formulario público, la pantalla de licencia
  // (tiene que verse aunque no haya sesión ni licencia), el cron (protegido por
  // su propio CRON_SECRET), el portal de clientes (tiene su propia lógica
  // arriba — /portal/login es su único público), archivos estáticos e
  // internos de Next.
  matcher: [
    "/((?!login|formulario|licencia|api/cron|_next/static|_next/image|favicon.ico|.*\\.svg$).*)",
  ],
};
