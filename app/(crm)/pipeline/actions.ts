"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { applyStageMove, applyDealUpdate } from "@/lib/deals";
import { validateForm, formDataToRecord } from "@/lib/engine/validate";

export async function updateDeal(formData: FormData) {
  const dealId = formData.get("dealId") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!dealId || !title) return;

  const session = await getSession();
  const rawDate = formData.get("expectedCloseDate") as string;

  const result = await applyDealUpdate(
    dealId,
    {
      title,
      amount: Number(formData.get("amount")) || 0,
      expectedCloseDate: rawDate ? new Date(rawDate) : null,
      reason: (formData.get("reason") as string) || undefined,
    },
    session
  );

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath("/aprobaciones");
  revalidatePath("/");

  redirect(result === "pending" ? `/pipeline/${dealId}?solicitud=enviada` : "/pipeline");
}
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function deleteDeal(dealId: string) {
  const session = await getSession();
  if (!canDelete(session?.role) || !dealId) return;

  await prisma.deal.delete({ where: { id: dealId } });

  revalidatePath("/pipeline");
  revalidatePath("/");
}

export async function createDeal(formData: FormData) {
  const title = (formData.get("title") as string)?.trim();
  const stageId = formData.get("stageId") as string;
  if (!title || !stageId) return;

  // Validación del Automation Engine (obligatoria, server-side)
  const sessionForValidation = await getSession();
  const validation = await validateForm("deal", {
    record: formDataToRecord(formData),
    user: sessionForValidation,
  });
  if (!validation.ok) {
    redirect(`/pipeline/nueva?error=${encodeURIComponent(validation.errors[0])}`);
  }

  const contactId = (formData.get("contactId") as string) || null;
  // Si el contacto tiene empresa, la oportunidad hereda esa empresa
  const contact = contactId
    ? await prisma.contact.findUnique({ where: { id: contactId } })
    : null;

  const rawDate = formData.get("expectedCloseDate") as string;
  const session = await getSession();

  const deal = await prisma.deal.create({
    data: {
      title,
      amount: Number(formData.get("amount")) || 0,
      stageId,
      contactId,
      companyId: contact?.companyId ?? null,
      expectedCloseDate: rawDate ? new Date(rawDate) : null,
      ownerId: session?.id ?? null,
    },
  });

  await prisma.activity.create({
    data: {
      type: "sistema",
      content: `Oportunidad creada: ${title}`,
      contactId,
      dealId: deal.id,
    },
  });

  revalidatePath("/pipeline");
  revalidatePath("/");
  redirect("/pipeline");
}

export async function moveDeal(dealId: string, stageId: string, reason?: string) {
  const session = await getSession();
  const result = await applyStageMove(dealId, stageId, session, reason);

  revalidatePath("/pipeline");
  revalidatePath("/");
  revalidatePath("/aprobaciones");
  return result;
}
