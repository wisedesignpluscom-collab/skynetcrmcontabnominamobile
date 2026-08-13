// Chat interno cliente ↔ gestor (Fase 2 del portal). Módulo server-only (usa
// Prisma) pero sin cookies()/redirect(): las Server Actions de cada lado
// (app/(crm)/empresas/chat-actions.ts y app/portal/(app)/chat/actions.ts) son
// wrappers finos sobre estas funciones — mismo principio que lib/portal.ts,
// para poder probarlas sin el runtime de Next.
import { prisma } from "./prisma";

export const MAX_MENSAJE_LENGTH = 4000;

export type AutorTipo = "staff" | "cliente";

export type NuevoMensaje = {
  companyId: string;
  contenido: string;
  autorTipo: AutorTipo;
  userId?: string | null;
  portalUserId?: string | null;
};

// Cada mensaje nace leído por quien lo escribe y sin leer por el otro lado —
// así el contador de "no leídos" siempre mira hacia el lado contrario.
export async function crearMensaje(datos: NuevoMensaje) {
  const contenido = datos.contenido.trim().slice(0, MAX_MENSAJE_LENGTH);
  if (!contenido) return null;

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
