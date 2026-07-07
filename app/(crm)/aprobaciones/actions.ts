"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canApprove } from "@/lib/permissions";
import { emitStageEvents } from "@/lib/deals";
import { revalidatePath } from "next/cache";

function revalidateAll() {
  revalidatePath("/aprobaciones");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

const cleanPending = {
  pendingAction: null,
  pendingReason: null,
  pendingAmount: null,
  pendingAt: null,
  pendingById: null,
};

export async function approveRequest(formData: FormData) {
  const session = await getSession();
  if (!canApprove(session?.role)) return;

  const dealId = formData.get("dealId") as string;
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal || !deal.pendingAction) return;

  if (deal.pendingAction === "lost") {
    const lostStage = await prisma.pipelineStage.findFirst({ where: { type: "lost" } });
    if (!lostStage) return;

    await prisma.deal.update({
      where: { id: dealId },
      data: {
        stageId: lostStage.id,
        status: "lost",
        closedAt: new Date(),
        ...cleanPending,
      },
    });

    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Pérdida aprobada por ${session!.name}: "${deal.title}". Motivo: ${deal.pendingReason ?? "sin especificar"}`,
        contactId: deal.contactId,
        dealId: deal.id,
      },
    });

    // La pérdida aprobada es un cambio de etapa como cualquier otro: emite
    // deal.stage_changed/deal.lost y los eventos de Pipeline Rules
    const fromStage =
      deal.stageId === lostStage.id
        ? null
        : await prisma.pipelineStage.findUnique({ where: { id: deal.stageId } });
    await emitStageEvents(
      dealId,
      fromStage ? { id: fromStage.id, name: fromStage.name } : null,
      { id: lostStage.id, name: lostStage.name },
      session
    );
  }

  if (deal.pendingAction === "discount") {
    await prisma.deal.update({
      where: { id: dealId },
      data: {
        amount: deal.pendingAmount ?? deal.amount,
        ...cleanPending,
      },
    });

    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Descuento aprobado por ${session!.name}: "${deal.title}" pasa de $${deal.amount} a $${deal.pendingAmount}. Motivo: ${deal.pendingReason ?? "sin especificar"}`,
        contactId: deal.contactId,
        dealId: deal.id,
      },
    });
  }

  revalidateAll();
}

export async function rejectRequest(formData: FormData) {
  const session = await getSession();
  if (!canApprove(session?.role)) return;

  const dealId = formData.get("dealId") as string;
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal || !deal.pendingAction) return;

  const label =
    deal.pendingAction === "discount"
      ? `Descuento rechazado por ${session!.name}: "${deal.title}" mantiene su valor de $${deal.amount}.`
      : `Solicitud de pérdida rechazada por ${session!.name}: "${deal.title}" sigue activa — continuar trabajándola.`;

  await prisma.deal.update({
    where: { id: dealId },
    data: cleanPending,
  });

  await prisma.activity.create({
    data: {
      type: "sistema",
      content: label,
      contactId: deal.contactId,
      dealId: deal.id,
    },
  });

  revalidateAll();
}
