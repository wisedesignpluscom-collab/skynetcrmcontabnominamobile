// Chat interno cliente ↔ gestor (Fase 2 del portal). Módulo server-only (usa
// Prisma) pero sin cookies()/redirect(): las Server Actions de cada lado
// (app/(crm)/empresas/chat-actions.ts y app/portal/(app)/chat/actions.ts) son
// wrappers finos sobre estas funciones — mismo principio que lib/portal.ts,
// para poder probarlas sin el runtime de Next.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "./prisma";

export const MAX_MENSAJE_LENGTH = 4000;

export type AutorTipo = "staff" | "cliente";

// Adjuntos del chat — mismos límites que WhatsApp: 16 MB para fotos/imágenes,
// 100 MB para documentos. Se guardan en disco (no en la BD): SQLite/Postgres
// no están pensados para blobs de decenas de MB, y el servidor Windows del
// cliente tiene disco de sobra.
export const MAX_TAMANO_IMAGEN = 16 * 1024 * 1024;
export const MAX_TAMANO_DOCUMENTO = 100 * 1024 * 1024;

const MIME_IMAGEN = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// Documentos típicos de una firma contable. Deliberadamente NO incluye
// ejecutables, scripts ni HTML: el portal recibe archivos de internet.
const MIME_DOCUMENTO = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/rtf",
]);

const UPLOADS_ROOT = join(process.cwd(), "uploads", "chat");

export type ArchivoMensaje = {
  archivoNombre: string;
  archivoRuta: string;
  archivoMime: string;
  archivoTamano: number;
};

function nombreSeguro(nombre: string) {
  return nombre.replace(/[^\w.\-() ]+/g, "_").slice(-150) || "archivo";
}

// Valida tipo y tamaño ANTES de tocar disco. Mensaje en español listo para
// mostrarle al usuario (patrón de las Validation Rules del engine).
export function errorArchivoChat(file: File): string | null {
  const mime = file.type || "application/octet-stream";
  const esImagen = MIME_IMAGEN.has(mime);
  const esDocumento = MIME_DOCUMENTO.has(mime);
  if (!esImagen && !esDocumento) {
    return "Ese tipo de archivo no está permitido. Se aceptan imágenes y documentos comunes (PDF, Word, Excel…).";
  }
  const limite = esImagen ? MAX_TAMANO_IMAGEN : MAX_TAMANO_DOCUMENTO;
  if (file.size > limite) {
    return esImagen
      ? "La imagen supera el límite de 16 MB."
      : "El archivo supera el límite de 100 MB.";
  }
  return null;
}

// Guarda el archivo en uploads/chat/<companyId>/ con un nombre único. Asume
// que errorArchivoChat() ya se llamó y no encontró problemas.
export async function guardarArchivoChat(file: File, companyId: string): Promise<ArchivoMensaje> {
  const mime = file.type || "application/octet-stream";
  const dir = join(UPLOADS_ROOT, companyId);
  await mkdir(dir, { recursive: true });
  const nombreArchivo = `${randomUUID()}-${nombreSeguro(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, nombreArchivo), buffer);

  return {
    archivoNombre: file.name || nombreArchivo,
    archivoRuta: `${companyId}/${nombreArchivo}`,
    archivoMime: mime,
    archivoTamano: file.size,
  };
}

// Lee el archivo para servirlo — usado por app/api/chat/archivo/[id]/route.ts,
// que hace el control de acceso (empresa del mensaje == empresa de quien pide).
export async function leerArchivoChat(rutaRelativa: string): Promise<Buffer> {
  return readFile(join(UPLOADS_ROOT, rutaRelativa));
}

export type NuevoMensaje = {
  companyId: string;
  contenido: string;
  autorTipo: AutorTipo;
  userId?: string | null;
  portalUserId?: string | null;
  archivo?: ArchivoMensaje | null;
};

// Cada mensaje nace leído por quien lo escribe y sin leer por el otro lado —
// así el contador de "no leídos" siempre mira hacia el lado contrario.
export async function crearMensaje(datos: NuevoMensaje) {
  const contenido = datos.contenido.trim().slice(0, MAX_MENSAJE_LENGTH);
  if (!contenido && !datos.archivo) return null;

  const ahora = new Date();
  return prisma.mensajeChat.create({
    data: {
      companyId: datos.companyId,
      contenido,
      autorTipo: datos.autorTipo,
      userId: datos.autorTipo === "staff" ? (datos.userId ?? null) : null,
      portalUserId: datos.autorTipo === "cliente" ? (datos.portalUserId ?? null) : null,
      readByStaffAt: datos.autorTipo === "staff" ? ahora : null,
      readByClientAt: datos.autorTipo === "cliente" ? ahora : null,
      ...(datos.archivo ?? {}),
    },
  });
}

// El gestor abrió el chat de esta empresa: los mensajes del cliente quedan leídos.
export async function marcarLeidoPorStaff(companyId: string) {
  await prisma.mensajeChat.updateMany({
    where: { companyId, autorTipo: "cliente", readByStaffAt: null },
    data: { readByStaffAt: new Date() },
  });
}

// El cliente abrió su chat: los mensajes del gestor quedan leídos.
export async function marcarLeidoPorCliente(companyId: string) {
  await prisma.mensajeChat.updateMany({
    where: { companyId, autorTipo: "staff", readByClientAt: null },
    data: { readByClientAt: new Date() },
  });
}

// Mensajes del cliente sin leer por el gestor, dentro del alcance de su
// cartera (fragmento `where` de companyScope) — para la campanita.
export function noLeidosPorStaffWhere(scopeEmpresa: object) {
  return { autorTipo: "cliente", readByStaffAt: null, company: scopeEmpresa };
}

// Mensajes del gestor sin leer por el cliente de UNA empresa — para el
// contador del portal (nav "Chat").
export async function contarNoLeidosPorCliente(companyId: string): Promise<number> {
  return prisma.mensajeChat.count({
    where: { companyId, autorTipo: "staff", readByClientAt: null },
  });
}
