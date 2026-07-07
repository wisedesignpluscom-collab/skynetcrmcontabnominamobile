// ══ Automation Engine — Sistema de eventos (Fase 3) ═════════════════════════
// El CRM no tenía un event system formal: las server actions llamaban funciones
// concretas. Este módulo lo formaliza: emitEvent(evento) carga los workflows
// cuyo trigger coincide, evalúa sus condiciones con el evaluador de la Fase 1
// y encola las acciones como WorkflowJob (la cola corre aparte, ver queue.ts).
// emitEvent solo hace inserts — es rápido y nunca bloquea la respuesta al usuario.

import { prisma } from "@/lib/prisma";
import { loadRules } from "./load";
import { evaluateRules, type ActionDef, type RuleContext } from "./evaluator";

// ── Catálogo de eventos ──────────────────────────────────────────────────────
// Vive en builder.ts (módulo puro, importable desde el cliente del Builder);
// se re-exporta desde aquí para los consumidores del lado servidor.
export { EVENT_TYPES } from "./builder";

// Máxima profundidad de una cadena de eventos (una acción dispara otro evento…)
export const MAX_EVENT_DEPTH = 3;

export type EngineEvent = {
  type: string;
  entity: string;
  entityId: string;
  // El registro como objeto plano (puede traer anidados: contact, stage…)
  record: Record<string, unknown>;
  user?: { id: string; role: string } | null;
  pipeline?: RuleContext["pipeline"];
  // Guards anti-bucle: los setean los ejecutores al re-emitir, no los callers del CRM
  depth?: number;
  chain?: string[];
};

// Acción especial: no se ejecuta, desplaza el runAt de las acciones siguientes
export const WAIT_ACTION = "esperar";

export function waitMillis(params: Record<string, unknown>): number {
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  return (
    num(params.dias) * 86_400_000 +
    num(params.horas) * 3_600_000 +
    num(params.minutos) * 60_000
  );
}

// Planifica los jobs de una lista de acciones: «esperar» acumula retraso y las
// acciones que le siguen se agendan con ese retraso. Exportada para tests.
export function planJobs(
  actions: ActionDef[],
  now: Date
): { action: string; params: Record<string, unknown>; runAt: Date }[] {
  const jobs: { action: string; params: Record<string, unknown>; runAt: Date }[] = [];
  let delayMs = 0;
  for (const action of actions) {
    if (action.type === WAIT_ACTION) {
      delayMs += waitMillis(action.params);
      continue;
    }
    jobs.push({ action: action.type, params: action.params, runAt: new Date(now.getTime() + delayMs) });
  }
  return jobs;
}

// ── Emisión ──────────────────────────────────────────────────────────────────
// Devuelve cuántos jobs encoló. El caller decide si dispara la cola después
// (las server actions usan emitEventAndProcess de queue.ts).
export async function emitEvent(evt: EngineEvent): Promise<number> {
  const depth = evt.depth ?? 0;
  if (depth >= MAX_EVENT_DEPTH) return 0; // corta cadenas acción→evento→acción…

  const rules = await loadRules({ trigger: evt.type });
  if (rules.length === 0) return 0;

  const chain = evt.chain ?? [];
  const ctx: RuleContext = {
    record: evt.record,
    user: evt.user ?? null,
    pipeline: evt.pipeline ?? null,
  };

  // Reglas ligadas a una etapa (pipeline.entrada/salida) solo aplican si el
  // evento trae esa etapa en su contexto de pipeline
  const applicable = rules.filter(
    (r) => !r.stageId || r.stageId === evt.pipeline?.stageId
  );

  const now = new Date();
  let enqueued = 0;
  for (const result of evaluateRules(applicable, ctx)) {
    // Una misma regla no se re-dispara sobre la misma entidad dentro de la cadena
    if (chain.includes(`${result.ruleId}:${evt.entityId}`)) continue;
    const nextChain = [...chain, `${result.ruleId}:${evt.entityId}`];

    for (const job of planJobs(result.actions, now)) {
      await prisma.workflowJob.create({
        data: {
          ruleId: result.ruleId,
          trigger: evt.type,
          entity: evt.entity,
          entityId: evt.entityId,
          action: job.action,
          params: JSON.stringify(job.params),
          payload: JSON.stringify(evt.record),
          runAt: job.runAt,
          depth,
          chain: JSON.stringify(nextChain),
        },
      });
      enqueued++;
    }
  }
  return enqueued;
}
