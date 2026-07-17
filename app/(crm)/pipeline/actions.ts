"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete, canApprove } from "@/lib/permissions";
import { applyStageMove, applyDealUpdate } from "@/lib/deals";
import { isPriceLocked, priceForService } from "@/lib/services";
import { validateForm, formDataToRecord } from "@/lib/engine/validate";
import { emitEventAndProcess } from "@/lib/engine/queue";

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

  const snapshot = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { contact: true, stage: true },
  });
  await prisma.deal.delete({ where: { id: dealId } });

  if (snapshot) {
    await emitEventAndProcess({
      type: "deal.deleted",
      entity: "deal",
      entityId: dealId,
      record: snapshot,
      user: session,
    });
  }

  revalidatePath("/pipeline");
  revalidatePath("/");
}

// Eliminar / solicitar eliminación de una oportunidad. Admin/supervisor eliminan
// directo; el vendedor solo puede SOLICITAR (queda pendiente de aprobación).
export async function requestDealDeletion(formData: FormData) {
  const session = await getSession();
  if (!session) return;
  const dealId = formData.get("dealId") as string;
  const reason = (formData.get("reason") as string)?.trim() || null;
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) return;

  if (canApprove(session.role)) {
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Oportunidad eliminada por ${session.name}: "${deal.title}"`,
        contactId: deal.contactId,
      },
    });
    await prisma.deal.delete({ where: { id: dealId } });
    revalidatePath("/pipeline");
    revalidatePath("/");
    redirect("/pipeline");
  }

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      pendingAction: "delete",
      pendingReason: reason,
      pendingAt: new Date(),
      pendingById: session.id,
    },
  });
  await prisma.activity.create({
    data: {
      type: "sistema",
      content: `Solicitud de eliminación enviada por ${session.name}: "${deal.title}". Motivo: ${reason ?? "sin especificar"}`,
      contactId: deal.contactId,
      dealId,
    },
  });
  revalidatePath("/aprobaciones");
  redirect(`/pipeline/${dealId}?solicitud=enviada`);
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

  // Precio: si la regla está activa, lo define el servicio elegido (no manual).
  const serviceId = (formData.get("serviceId") as string) || null;
  const locked = await isPriceLocked();
  const servicePrice = await priceForService(serviceId);
  const amount = locked ? servicePrice ?? 0 : Number(formData.get("amount")) || 0;

  const deal = await prisma.deal.create({
    data: {
      title,
      amount,
      serviceId,
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

  await emitEventAndProcess({
    type: "deal.created",
    entity: "deal",
    entityId: deal.id,
    record: { ...deal, contact },
    user: session,
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
