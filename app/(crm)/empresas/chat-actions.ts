"use server";

// Chat con el cliente desde la ficha (Fase 2). Mismo patrón que plan-actions.ts:
// quien puede ver el cliente puede hablar con él.

import { getSession } from "@/lib/session";
import { canAccessCompany } from "@/lib/ownership";
import { crearMensaje, marcarLeidoPorStaff, errorArchivoChat, guardarArchivoChat } from "@/lib/chat";
import { revalidatePath } from "next/cache";

async function sesionConAcceso(companyId: string) {
  const session = await getSession();
  if (!session || !companyId) return null;
  return (await canAccessCompany(session, companyId)) ? session : null;
}

export async function enviarMensajeStaff(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string } | undefined> {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session) return { error: "No tienes acceso a este cliente." };

  const contenido = (formData.get("contenido") as string) ?? "";
  const file = formData.get("archivo");
  const archivo = file instanceof File && file.size > 0 ? file : null;

  if (archivo) {
    const error = errorArchivoChat(archivo);
    if (error) return { error };
  }
  if (!contenido.trim() && !archivo) return undefined;

  const datosArchivo = archivo ? await guardarArchivoChat(archivo, companyId) : null;
  await crearMensaje({
    companyId,
    contenido,
    autorTipo: "staff",
    userId: session.id,
    archivo: datosArchivo,
  });
  revalidatePath(`/empresas/${companyId}`);
  return undefined;
}

export async function marcarChatLeidoStaff(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  await marcarLeidoPorStaff(companyId);
  revalidatePath(`/empresas/${companyId}`);
}
