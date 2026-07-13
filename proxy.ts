import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getAuthSecret, JWT_ALG } from "@/lib/authSecret";

const COOKIE_NAME = "skynet_session";

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      await jwtVerify(token, getAuthSecret(), { algorithms: [JWT_ALG] });
      return NextResponse.next();
    } catch {
      // Token inválido o expirado: cae al redirect de abajo
    }
  }

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Protege todo excepto login, el formulario público, el cron (protegido por su
  // propio CRON_SECRET), archivos estáticos e internos de Next
  matcher: ["/((?!login|formulario|api/cron|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
