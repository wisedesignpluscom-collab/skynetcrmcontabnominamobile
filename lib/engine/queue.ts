// ══ Automation Engine — Cola de ejecución (Fase 3) ══════════════════════════
// In-process, sin infraestructura externa (mismo espíritu que runSweeps):
// - Las server actions encolan con emitEventAndProcess() y la cola corre sin
//   bloquear la respuesta al usuario.
// - El heartbeat de /api/alertas llama runEngineTick(): recoge jobs diferidos
//   («esperar»), reintentos con backoff y evalúa los triggers de tiempo.
// Reintentos: maxAttempts por job (3), backoff exponencial. La fila del job es
// el log de ejecución (status, attempts, lastError, detail).

import { prisma } from "@/lib/prisma";
import { loadRules } from "./load";
import { evaluateRule } from "./evaluator";
import { emitEvent, planJobs, type EngineEvent } from "./events";
import { runAction, NonRetryableError } from "./actions";

// Backoff tras un fallo: 1 min, 5 min, 15 min…
const BACKOFF_MINUTES = [1, 5, 15, 60];

// Los triggers de tiempo se revisan como mucho una vez por hora
const TICK_KEY = "workflow_tick_marker";
const TICK_INTERVAL_HOURS = 1;
// Una regla de tiempo no se re-dispara sobre la misma entidad antes de 24 h
const TIME_TRIGGER = "tiempo.transcurrido";
const TIME_DEDUPE_HOURS = 24;

function backoffDate(attempts: number): Date {
  const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60_000);
}

// Evita dos bucles de procesamiento simultáneos en el mismo proceso
let processing = false;

export async function processQueue(max = 25): Promise<number> {
  if (processing) return 0;
  processing = true;
  try {
    let processed = 0;
    while (processed < max) {
      const job = await prisma.workflowJob.findFirst({
        where: { status: "pending", runAt: { lte: new Date() } },
        orderBy: { runAt: "asc" },
      });
      if (!job) break;

      // Reclamo atómico: solo un consumidor pasa el updateMany condicionado
      const claimed = await prisma.workflowJob.updateMany({
        where: { id: job.id, status: "pending" },
        data: { status: "running", attempts: { increment: 1 } },
      });
      if (claimed.count === 0) continue;
      const attempts = job.attempts + 1;
      processed++;

      try {
        const detail = await runAction({ ...job, status: "running", attempts });
        await prisma.workflowJob.update({
          where: { id: job.id },
          data: { status: "ok", detail, lastError: null },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const dead = err instanceof NonRetryableError || attempts >= job.maxAttempts;
        await prisma.workflowJob.update({
          where: { id: job.id },
          data: dead
            ? { status: "error", lastError: message }
            : { status: "pending", runAt: backoffDate(attempts), lastError: message },
        });
      }
    }
    return processed;
  } finally {
    processing = false;
  }
}

// Punto de entrada para las server actions: encola y dispara la cola sin
// esperar el resultado (los efectos del workflow son asíncronos por diseño).
export async function emitEventAndProcess(evt: EngineEvent): Promise<void> {
  try {
    const enqueued = await emitEvent(evt);
    if (enqueued > 0) void processQueue().catch(() => {});
  } catch (err) {
    // Un workflow roto nunca debe tumbar la operación del CRM que lo disparó
    console.error("[workflow] error al emitir evento", evt.type, err);
  }
}

// ── Triggers de tiempo ───────────────────────────────────────────────────────
// Reglas con trigger "tiempo.transcurrido": se evalúan periódicamente sobre los
// registros de su módulo (ej. "deal sin movimiento en 14 días"). Mientras la
// condición se cumpla, la regla re-dispara como mucho una vez cada 24 h.
async function sweepTimeRules(): Promise<number> {
  const rules = await loadRules({ trigger: TIME_TRIGGER });
  if (rules.length === 0) return 0;

  const dedupeSince = new Date(Date.now() - TIME_DEDUPE_HOURS * 3600_000);
  let enqueued = 0;

  for (const rule of rules) {
    // Registros del módulo (instalación de una sola empresa: volúmenes chicos)
    let records: Record<string, unknown>[] = [];
    switch (rule.module) {
      case "contact":
        records = await prisma.contact.findMany({ take: 500 });
        break;
      case "company":
        records = await prisma.company.findMany({ take: 500 });
        break;
      case "deal":
        records = await prisma.deal.findMany({ take: 500, include: { contact: true, stage: true } });
        break;
      case "task":
        records = await prisma.task.findMany({ where: { done: false }, take: 500 });
        break;
      case "followup":
        records = await prisma.followUp.findMany({ take: 500, include: { contact: true } });
        break;
      default:
        continue;
    }

    for (const record of records) {
      const entityId = String(record.id);
      if (!evaluateRule(rule, { record }).matched) continue;

      const recent = await prisma.workflowJob.findFirst({
        where: { ruleId: rule.id, entityId, createdAt: { gte: dedupeSince } },
        select: { id: true },
      });
      if (recent) continue;

      const now = new Date();
      for (const job of planJobs(rule.actions, now)) {
        await prisma.workflowJob.create({
          data: {
            ruleId: rule.id,
            trigger: TIME_TRIGGER,
            entity: rule.module,
            entityId,
            action: job.action,
            params: JSON.stringify(job.params),
            payload: JSON.stringify(record),
            runAt: job.runAt,
          },
        });
        enqueued++;
      }
    }
  }
  return enqueued;
}

// Heartbeat del engine: lo llama /api/alertas con el uso normal del sistema.
// La cola se procesa siempre (recoge esperas y reintentos vencidos); el barrido
// de triggers de tiempo, como mucho una vez por hora.
export async function runEngineTick(): Promise<void> {
  const marker = await prisma.automationRule.findUnique({ where: { key: TICK_KEY } });
  const due =
    !marker?.lastRunAt ||
    Date.now() - marker.lastRunAt.getTime() >= TICK_INTERVAL_HOURS * 3600_000;

  if (due) {
    await prisma.automationRule.upsert({
      where: { key: TICK_KEY },
      update: { lastRunAt: new Date() },
      create: { key: TICK_KEY, enabled: true, days: 0, lastRunAt: new Date() },
    });
    await sweepTimeRules();
  }

  await processQueue();
}
