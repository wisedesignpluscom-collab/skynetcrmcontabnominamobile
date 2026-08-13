"use server";

// Chat con el gestor desde el portal (Fase 2). Las acciones del portal NO pasan
// por el layout en cada invocación (son RPC directas), así que cada una
// re-verifica `active` contra la BD — igual que cambiarPasswordPortal en
// app/portal/(app)/cuenta/actions.ts — para que una desactivación corte
// también el envío de mensajes, no solo la navegación.

import { prisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/portalSession";
import {
  crearMensaje,
  marcarLeidoPorCliente,
  errorArchivoChat,
  guardarArchivoChat,
} from "@/lib/chat";
import { revalidatePath } from "next/cache";

async function sesionActiva() {
  const session = await getPortalSession();
  if (!session) return null;
  const user = await prisma.portalUser.findUnique({ where: { id: session.id } });
  return user?.active ? session : null;
}

export async function enviarMensajePortal(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string } | undefined> {
  const session = await sesionActiva();
  if (!session) return { error: "Tu sesión no está activa. Vuelve a iniciar sesión." };

  const contenido = (formData.get("contenido") as string) ?? "";
  const file = formData.get("archivo");
  const archivo = file instanceof File && file.size > 0 ? file : null;

  if (archivo) {
    const error = errorArchivoChat(archivo);
    if (error) return { error };
  }
  if (!contenido.trim() && !archivo) return undefined;

  const datosArchivo = archivo ? await guardarArchivoChat(archivo, session.companyId) : null;
  await crearMensaje({
    companyId: session.companyId,
    contenido,
    autorTipo: "cliente",
    portalUserId: session.id,
    archivo: datosArchivo,
  });
  revalidatePath("/portal/chat");
  return undefined;
}

export async function marcarChatLeidoPortal() {
  const session = await sesionActiva();
  if (!session) return;
  await marcarLeidoPorCliente(session.companyId);
  revalidatePath("/portal/chat");
  revalidatePath("/portal");
}
