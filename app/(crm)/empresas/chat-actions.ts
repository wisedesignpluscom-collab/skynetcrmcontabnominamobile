"use server";

// Chat con el cliente desde la ficha (Fase 2). Mismo patrón que plan-actions.ts:
// quien puede ver el cliente puede hablar con él.

import { getSession } from "@/lib/session";
import { canAccessCompany } from "@/lib/ownership";
import { crearMensaje, marcarLeidoPorStaff } from "@/lib/chat";
import { revalidatePath } from "next/cache";

async function sesionConAcceso(companyId: string) {
  const session = await getSession();
  if (!session || !companyId) return null;
  return (await canAccessCompany(session, companyId)) ? session : null;
}

export async function enviarMensajeStaff(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session) return;

  const contenido = (formData.get("contenido") as string) ?? "";
  await crearMensaje({ companyId, contenido, autorTipo: "staff", userId: session.id });
  revalidatePath(`/empresas/${companyId}`);
}

export async function marcarChatLeidoStaff(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  await marcarLeidoPorStaff(companyId);
  revalidatePath(`/empresas/${companyId}`);
}
