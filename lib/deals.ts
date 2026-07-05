import { prisma } from "./prisma";
import { canApprove } from "./permissions";
import type { SessionUser } from "./session";

// Rebaja máxima que un vendedor puede aplicar sin aprobación del supervisor
export const DISCOUNT_APPROVAL_THRESHOLD = 0.15; // 15%

// Actualiza título/valor/fecha de una oportunidad aplicando la regla de descuentos:
// si un vendedor baja el valor más del umbral, el nuevo valor queda pendiente
// de aprobación y el precio actual no cambia.
export async function applyDealUpdate(
  dealId: string,
  data: { title: string; amount: number; expectedCloseDate: Date | null; reason?: string },
  session: SessionUser | null
): Promise<"pending" | "updated" | "not-found"> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) return "not-found";

  const isBigDiscount =
    deal.amount > 0 && data.amount < deal.amount * (1 - DISCOUNT_APPROVAL_THRESHOLD);

  if (isBigDiscount && !canApprove(session?.role)) {
    // Título y fecha se actualizan; el nuevo precio queda en espera
    await prisma.deal.update({
      where: { id: dealId },
      data: {
        title: data.title,
        expectedCloseDate: data.expectedCloseDate,
        pendingAction: "discount",
        pendingAmount: data.amount,
        pendingReason: data.reason?.trim() || null,
        pendingAt: new Date(),
        pendingById: session?.id ?? null,
      },
    });
    const pct = Math.round((1 - data.amount / deal.amount) * 100);
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Solicitud de descuento enviada por ${session?.name ?? "vendedor"}: "${deal.title}" de $${deal.amount} a $${data.amount} (-${pct}%). Motivo: ${data.reason?.trim() || "sin especificar"}`,
        contactId: deal.contactId,
        dealId: deal.id,
      },
    });
    return "pending";
  }

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      title: data.title,
      amount: data.amount,
      expectedCloseDate: data.expectedCloseDate,
    },
  });

  if (data.amount !== deal.amount) {
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Valor actualizado: "${data.title}" de $${deal.amount} a $${data.amount}${data.reason?.trim() ? `. Motivo: ${data.reason.trim()}` : ""}`,
        contactId: deal.contactId,
        dealId: deal.id,
      },
    });
  }

  return "updated";
}

// Mueve una oportunidad de etapa aplicando las reglas de autorización:
// - Un vendedor que la suelta en "Perdido" no la cierra: crea una solicitud
//   pendiente que el supervisor debe aprobar.
// - Supervisor/admin cierran directamente (ganado o perdido).
// Devuelve "pending" si quedó en espera de aprobación, "moved" si se aplicó.
export async function applyStageMove(
  dealId: string,
  stageId: string,
  session: SessionUser | null,
  reason?: string
): Promise<"pending" | "moved" | "not-found"> {
  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!stage || !deal) return "not-found";

  // Pérdida solicitada por un vendedor → requiere aprobación
  if (stage.type === "lost" && !canApprove(session?.role)) {
    await prisma.deal.update({
      where: { id: dealId },
      data: {
        pendingAction: "lost",
        pendingReason: reason?.trim() || null,
        pendingAt: new Date(),
        pendingById: session?.id ?? null,
      },
    });
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Solicitud de pérdida enviada por ${session?.name ?? "vendedor"}: "${deal.title}". Motivo: ${reason?.trim() || "sin especificar"}`,
        contactId: deal.contactId,
        dealId: deal.id,
      },
    });
    return "pending";
  }

  const closing = stage.type === "won" || stage.type === "lost";

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stageId,
      status: stage.type === "open" ? "open" : stage.type,
      closedAt: closing ? new Date() : null,
      // Cualquier movimiento aplicado limpia solicitudes pendientes
      pendingAction: null,
      pendingReason: null,
      pendingAt: null,
      pendingById: null,
    },
  });

  if (stage.type === "won") {
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Oportunidad ganada: ${deal.title}`,
        contactId: deal.contactId,
        dealId: deal.id,
      },
    });
    // La venta ganada entra automáticamente a posventa
    if (deal.contactId) {
      await prisma.followUp.upsert({
        where: { dealId: deal.id },
        update: {},
        create: {
          dealId: deal.id,
          contactId: deal.contactId,
          stage: "onboarding",
          nextContactDate: new Date(Date.now() + 7 * 86400000),
        },
      });
      await prisma.contact.update({
        where: { id: deal.contactId },
        data: { status: "cliente" },
      });
    }
  }

  if (stage.type === "lost") {
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Oportunidad perdida: ${deal.title}${reason?.trim() ? `. Motivo: ${reason.trim()}` : ""}`,
        contactId: deal.contactId,
        dealId: deal.id,
      },
    });
  }

  return "moved";
}
