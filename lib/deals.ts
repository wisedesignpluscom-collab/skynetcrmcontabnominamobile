import { prisma } from "./prisma";
import { canApprove } from "./permissions";
import { onDealStageMoved } from "./automations";
import { recomputeHealth } from "./health";
import { emitEventAndProcess } from "./engine/queue";
import { loadRules } from "./engine/load";
import { evaluateRules } from "./engine/evaluator";
import { renderTemplate } from "./engine/actions";
import {
  PIPELINE_REQUIREMENT_TRIGGER,
  PIPELINE_ENTER_TRIGGER,
  PIPELINE_EXIT_TRIGGER,
} from "./engine/builder";
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

  const updated = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { contact: true, stage: true },
  });
  if (updated) {
    await emitEventAndProcess({
      type: "deal.updated",
      entity: "deal",
      entityId: dealId,
      record: updated,
      user: session,
      pipeline: { stageId: updated.stageId, stageName: updated.stage.name },
    });
  }

  return "updated";
}

// ── Pipeline Rules (Fase 5) ─────────────────────────────────────────────────

export type StageMoveResult =
  | { status: "moved" | "pending" | "not-found" }
  | { status: "blocked"; messages: string[] };

// Requisitos para entrar a una etapa (trigger pipeline.requisito, ligados a la
// etapa destino por ID): si la condición de alguna regla se cumple sobre la
// oportunidad, el movimiento se bloquea con los mensajes configurados.
// Corre síncrono (no encola nada) — es la única parte del engine que puede
// frenar una operación del CRM, igual que las Validation Rules al guardar.
export async function checkStageRequirements(
  deal: Record<string, unknown>,
  target: { id: string; name: string },
  session: SessionUser | null
): Promise<string[]> {
  const rules = await loadRules({ trigger: PIPELINE_REQUIREMENT_TRIGGER, stageId: target.id });
  if (rules.length === 0) return [];

  const results = evaluateRules(rules, {
    record: deal,
    user: session,
    pipeline: { stageId: target.id, stageName: target.name },
  });

  const messages: string[] = [];
  for (const result of results) {
    for (const action of result.actions) {
      if (action.type !== "bloquear_movimiento") continue;
      const raw = typeof action.params.message === "string" ? action.params.message : "";
      messages.push(
        renderTemplate(raw, deal).trim() ||
          `La oportunidad no cumple los requisitos para entrar a «${target.name}».`
      );
    }
  }
  return messages;
}

// Emite los eventos de un cambio de etapa YA aplicado: deal.stage_changed,
// deal.won/lost y los de Pipeline Rules (pipeline.salida de la etapa anterior,
// pipeline.entrada a la nueva). Centralizado para que cada movimiento emita
// cada evento exactamente una vez, venga del kanban o de una aprobación.
export async function emitStageEvents(
  dealId: string,
  from: { id: string; name: string } | null,
  to: { id: string; name: string },
  session: SessionUser | null
): Promise<void> {
  const moved = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { contact: true, stage: true },
  });
  if (!moved) return;

  const base = {
    entity: "deal" as const,
    entityId: dealId,
    record: moved as unknown as Record<string, unknown>,
    user: session,
  };
  const toCtx = { pipeline: { stageId: to.id, stageName: to.name } };

  await emitEventAndProcess({ ...base, ...toCtx, type: "deal.stage_changed" });
  if (moved.status === "won") await emitEventAndProcess({ ...base, ...toCtx, type: "deal.won" });
  if (moved.status === "lost") await emitEventAndProcess({ ...base, ...toCtx, type: "deal.lost" });

  // Pipeline Rules: el contexto de pipeline lleva la etapa que gobierna cada
  // evento (emitEvent solo aplica reglas cuyo stageId coincide con él)
  if (from && from.id !== to.id) {
    await emitEventAndProcess({
      ...base,
      type: PIPELINE_EXIT_TRIGGER,
      pipeline: { stageId: from.id, stageName: from.name },
    });
  }
  await emitEventAndProcess({ ...base, ...toCtx, type: PIPELINE_ENTER_TRIGGER });
}

// Mueve una oportunidad de etapa aplicando las reglas de autorización:
// - Un vendedor que la suelta en "Perdido" no la cierra: crea una solicitud
//   pendiente que el supervisor debe aprobar.
// - Supervisor/admin cierran directamente (ganado o perdido).
// - Los requisitos de etapa (Pipeline Rules) pueden bloquear el movimiento.
// Devuelve status "pending" si quedó en espera de aprobación, "moved" si se
// aplicó, "blocked" (con mensajes) si un requisito de etapa lo frenó.
export async function applyStageMove(
  dealId: string,
  stageId: string,
  session: SessionUser | null,
  reason?: string
): Promise<StageMoveResult> {
  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { contact: true, stage: true },
  });
  if (!stage || !deal) return { status: "not-found" };

  // Reordenar dentro de la misma columna no es un cambio de etapa: sin
  // requisitos, sin reglas y sin eventos (evita ejecuciones duplicadas)
  if (deal.stageId === stageId) return { status: "moved" };

  // Requisitos para entrar a la etapa destino (Pipeline Rules)
  const blockers = await checkStageRequirements(
    deal as unknown as Record<string, unknown>,
    { id: stage.id, name: stage.name },
    session
  );
  if (blockers.length > 0) return { status: "blocked", messages: blockers };

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
    return { status: "pending" };
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
      const followUp = await prisma.followUp.upsert({
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
      // Salud inicial del cliente recién entrado a posventa
      await recomputeHealth(followUp.id);
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

  // Reglas de automatización por cambio de etapa (ej. seguimiento de propuestas)
  if (stage.type === "open") {
    await onDealStageMoved(dealId, stage.name);
  }

  // Workflow Engine + Pipeline Rules: eventos del cambio de etapa aplicado
  await emitStageEvents(
    dealId,
    deal.stage ? { id: deal.stage.id, name: deal.stage.name } : null,
    { id: stage.id, name: stage.name },
    session
  );

  return { status: "moved" };
}
