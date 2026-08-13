// Sirve los adjuntos del chat cliente-gestor. No están bajo /public a
// propósito: el control de acceso es por empresa (un cliente jamás debe poder
// adivinar la URL del adjunto de otro), así que cada descarga pasa por aquí.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getPortalSession } from "@/lib/portalSession";
import { canAccessCompany } from "@/lib/ownership";
import { leerArchivoChat } from "@/lib/chat";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const mensaje = await prisma.mensajeChat.findUnique({
    where: { id },
    select: { companyId: true, archivoRuta: true, archivoMime: true, archivoNombre: true },
  });
  if (!mensaje || !mensaje.archivoRuta) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const staffSession = await getSession();
  let autorizado = staffSession ? await canAccessCompany(staffSession, mensaje.companyId) : false;
  if (!autorizado) {
    const portalSession = await getPortalSession();
    autorizado = portalSession?.companyId === mensaje.companyId;
  }
  if (!autorizado) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  let buffer: Buffer;
  try {
    buffer = await leerArchivoChat(mensaje.archivoRuta);
  } catch {
    return new NextResponse("El archivo ya no está disponible", { status: 404 });
  }

  const esImagen = (mensaje.archivoMime ?? "").startsWith("image/");
  const nombre = encodeURIComponent(mensaje.archivoNombre ?? "archivo");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mensaje.archivoMime ?? "application/octet-stream",
      "Content-Disposition": `${esImagen ? "inline" : "attachment"}; filename*=UTF-8''${nombre}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
