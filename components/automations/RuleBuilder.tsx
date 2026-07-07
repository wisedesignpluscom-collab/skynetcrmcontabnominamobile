"use client";

// Constructor visual de automatizaciones (Fase 4). Dibuja el flujo
// Inicio → Condición → ramas Sí/No → Acciones → Fin con CSS propio (la
// topología es fija porque el engine es trigger → condiciones → acciones,
// así que no hace falta una librería de diagramas). El estado del Builder
// usa las MISMAS estructuras del evaluador (GroupDef/acciones ordenadas).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EVENT_TYPES,
  MODULES,
  PIPELINE_TRIGGERS,
  PIPELINE_REQUIREMENT_TRIGGER,
  RULE_KINDS,
  actionsForTrigger,
  validateDraft,
  type DraftAction,
  type RuleDraft,
  type RuleKind,
} from "@/lib/engine/builder";
import type { GroupDef } from "@/lib/engine/evaluator";
import { saveAutomation } from "@/app/(crm)/automatizaciones/actions";
import ConditionGroupEditor from "./ConditionGroupEditor";
import ActionEditor from "./ActionEditor";
import type { DynamicOptions } from "./types";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

type Selected = "inicio" | "condicion" | number | null; // number = índice de acción

function countConditions(g: GroupDef): number {
  return g.conditions.length + g.groups.reduce((n, child) => n + countConditions(child), 0);
}

function triggerLabel(draft: RuleDraft): string {
  if (draft.kind === "form") return "Mientras se llena el formulario";
  if (draft.kind === "validation") return "Al intentar guardar el registro";
  if (draft.kind === "pipeline") {
    return PIPELINE_TRIGGERS[draft.trigger]?.label ?? "Selecciona el disparador…";
  }
  return EVENT_TYPES[draft.trigger]?.label ?? "Selecciona un evento…";
}

// Acciones con las que arranca cada tipo de regla al seleccionarlo
function defaultActions(kind: RuleKind, trigger: string): DraftAction[] {
  if (kind === "validation") return [{ type: "validation_error", params: { message: "" } }];
  if (kind === "pipeline" && trigger === PIPELINE_REQUIREMENT_TRIGGER) {
    return [{ type: "bloquear_movimiento", params: { message: "" } }];
  }
  return [];
}

function actionSummary(a: DraftAction): string {
  const p = a.params;
  const first = p.titulo || p.message || p.mensaje || p.asunto || p.target || p.url || p.campo || "";
  return first.length > 46 ? `${first.slice(0, 46)}…` : first;
}

// ── Piezas visuales del canvas ───────────────────────────────────────────────

function Connector({ short }: { short?: boolean }) {
  return <div className={`w-px bg-slate-300 ${short ? "h-3" : "h-5"}`} aria-hidden />;
}

function Arrow() {
  return (
    <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 -mt-px text-slate-300" aria-hidden>
      <path d="M0 0l5 6 5-6z" fill="currentColor" />
    </svg>
  );
}

function NodeCard({
  selected,
  onClick,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full max-w-72 rounded-xl border px-4 py-2.5 text-left shadow-sm transition-all ${className} ${
        selected ? "ring-2 ring-teal-500 ring-offset-2" : "hover:shadow"
      }`}
    >
      {children}
    </button>
  );
}

function EndNode({ label = "Fin" }: { label?: string }) {
  return (
    <span className="rounded-full border border-slate-300 bg-slate-100 px-4 py-1 text-xs font-semibold text-slate-500">
      {label}
    </span>
  );
}

// ── Builder ──────────────────────────────────────────────────────────────────

export default function RuleBuilder({
  ruleId,
  initialDraft,
  options,
  isSystem = false,
}: {
  ruleId: string | null;
  initialDraft: RuleDraft;
  options: DynamicOptions;
  isSystem?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<RuleDraft>(initialDraft);
  const [selected, setSelected] = useState<Selected>("inicio");
  const [errors, setErrors] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, startSaving] = useTransition();

  const kind = RULE_KINDS[draft.kind];
  // kind.actions es el superconjunto (para etiquetas); lo agregable depende
  // del disparador (los requisitos de etapa solo pueden bloquear)
  const addableActions = actionsForTrigger(draft.kind, draft.trigger);
  const conditionCount = countConditions(draft.root);
  const eventsForModule = useMemo(
    () =>
      Object.entries(EVENT_TYPES).filter(
        ([, e]) => e.entity === draft.module || e.entity === "*"
      ),
    [draft.module]
  );

  const patch = (p: Partial<RuleDraft>) => setDraft((d) => ({ ...d, ...p }));

  function changeKind(next: RuleKind) {
    // Cada tipo tiene su propio set de acciones y su trigger: se resetean
    const trigger =
      next === "form"
        ? "form.change"
        : next === "validation"
          ? "form.validate"
          : next === "pipeline"
            ? PIPELINE_REQUIREMENT_TRIGGER
            : (eventsForModule[0]?.[0] ?? "contact.created");
    patch({
      kind: next,
      trigger,
      actions: defaultActions(next, trigger),
      // Las reglas de pipeline siempre operan sobre oportunidades
      ...(next === "pipeline" ? { module: "deal" } : { stageId: "" }),
    });
    setSelected("inicio");
  }

  function changePipelineTrigger(trigger: string) {
    // Requisito ↔ entrada/salida cambian el set de acciones: se resetean si
    // las actuales dejan de ser válidas
    const nextAllowed = actionsForTrigger("pipeline", trigger);
    const keep = draft.actions.every((a) => a.type in nextAllowed);
    patch({ trigger, actions: keep ? draft.actions : defaultActions("pipeline", trigger) });
  }

  function changeModule(module: string) {
    if (draft.kind === "workflow") {
      const evt = EVENT_TYPES[draft.trigger];
      if (evt && evt.entity !== "*" && evt.entity !== module) {
        const first = Object.entries(EVENT_TYPES).find(
          ([, e]) => e.entity === module || e.entity === "*"
        );
        patch({ module, trigger: first?.[0] ?? draft.trigger });
        return;
      }
    }
    patch({ module });
  }

  function addAction(type: string) {
    patch({ actions: [...draft.actions, { type, params: {} }] });
    setSelected(draft.actions.length);
    setAdding(false);
  }

  function moveAction(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.actions.length) return;
    const next = [...draft.actions];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ actions: next });
    setSelected(j);
  }

  function removeAction(i: number) {
    patch({ actions: draft.actions.filter((_, j) => j !== i) });
    setSelected(null);
  }

  function save() {
    const found = validateDraft(draft);
    setErrors(found);
    if (found.length > 0) return;
    startSaving(async () => {
      const result = await saveAutomation(ruleId, JSON.stringify(draft));
      if (result.ok) {
        router.push("/automatizaciones");
      } else {
        setErrors(result.errors);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Nombre y estado */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-60 flex-1 space-y-2">
            <input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Nombre de la automatización…"
              className={`${inputClass} w-full font-semibold`}
            />
            <input
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Descripción (opcional): qué hace y para qué sirve"
              className={`${inputClass} w-full text-xs`}
            />
          </div>
          <div className="flex items-center gap-2">
            {isSystem && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                SISTEMA
              </span>
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Prioridad
              <input
                type="number"
                value={draft.priority}
                onChange={(e) => patch({ priority: Number(e.target.value) || 0 })}
                className={`${inputClass} w-16 px-2 py-1.5 text-xs`}
                title="Las reglas se evalúan de menor a mayor prioridad"
              />
            </label>
            <button
              type="button"
              onClick={() => patch({ enabled: !draft.enabled })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                draft.enabled
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {draft.enabled ? "● Activada" : "○ Desactivada"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        {/* ── Canvas del flujo ── */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
          <div className="flex flex-col items-center">
            {/* Inicio */}
            <NodeCard
              selected={selected === "inicio"}
              onClick={() => setSelected("inicio")}
              className="border-teal-200 bg-teal-50"
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-teal-600">
                ▶ Inicio · {kind.label}
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-800">{triggerLabel(draft)}</p>
              <p className="text-[11px] text-slate-500">
                {draft.kind === "pipeline"
                  ? `Etapa: ${
                      (options.stage_id ?? []).find((o) => o.value === draft.stageId)?.label ??
                      "sin seleccionar"
                    }`
                  : `Módulo: ${MODULES[draft.module]?.label}`}
              </p>
            </NodeCard>
            <Connector />
            <Arrow />

            {/* Condición */}
            <NodeCard
              selected={selected === "condicion"}
              onClick={() => setSelected("condicion")}
              className="border-amber-200 bg-amber-50"
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">
                ◆ Condición
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-800">
                {conditionCount === 0
                  ? "Siempre (sin condiciones)"
                  : `${conditionCount} condición${conditionCount === 1 ? "" : "es"} (${
                      draft.root.operator === "AND" ? "todas" : "alguna"
                    })`}
              </p>
            </NodeCard>

            {/* Ramas Sí / No */}
            <div className="grid w-full grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
              <div className="flex flex-col items-center">
                <Connector short />
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  SÍ
                </span>
                <Connector short />
                <Arrow />

                {draft.actions.map((a, i) => {
                  const spec = kind.actions[a.type];
                  const isWait = a.type === "esperar";
                  return (
                    <div key={i} className="flex w-full flex-col items-center">
                      <div className="relative w-full max-w-72">
                        <NodeCard
                          selected={selected === i}
                          onClick={() => setSelected(i)}
                          className={
                            isWait
                              ? "w-full border-violet-200 bg-violet-50"
                              : "w-full border-sky-200 bg-white"
                          }
                        >
                          <p
                            className={`text-[10px] font-bold uppercase tracking-wide ${
                              isWait ? "text-violet-500" : "text-sky-600"
                            }`}
                          >
                            {isWait ? "⏱ Espera" : `⚡ Acción ${i + 1}`}
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-slate-800">
                            {spec?.label ?? a.type}
                          </p>
                          {actionSummary(a) && (
                            <p className="truncate text-[11px] text-slate-500">{actionSummary(a)}</p>
                          )}
                        </NodeCard>
                        <div className="absolute -right-1 top-1/2 flex -translate-y-1/2 translate-x-full flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveAction(i, -1)}
                            title="Subir"
                            className="rounded px-1 text-[10px] text-slate-400 hover:bg-slate-200"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAction(i)}
                            title="Quitar acción"
                            className="rounded px-1 text-[10px] text-red-400 hover:bg-red-50"
                          >
                            ✕
                          </button>
                          <button
                            type="button"
                            onClick={() => moveAction(i, 1)}
                            title="Bajar"
                            className="rounded px-1 text-[10px] text-slate-400 hover:bg-slate-200"
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                      <Connector />
                      <Arrow />
                    </div>
                  );
                })}

                {/* Agregar acción */}
                {adding ? (
                  <select
                    autoFocus
                    defaultValue=""
                    onChange={(e) => e.target.value && addAction(e.target.value)}
                    onBlur={() => setAdding(false)}
                    className={`${inputClass} max-w-72 text-xs`}
                  >
                    <option value="" disabled>
                      ¿Qué acción agregar?
                    </option>
                    {Object.entries(addableActions).map(([type, spec]) => (
                      <option key={type} value={type}>
                        {spec.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="rounded-lg border border-dashed border-slate-300 px-4 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-teal-400 hover:text-teal-600"
                  >
                    + Agregar acción
                  </button>
                )}
                <Connector />
                <EndNode />
              </div>

              <div className="flex flex-col items-center">
                <Connector short />
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                  NO
                </span>
                <Connector short />
                <Arrow />
                <EndNode label="No pasa nada" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Panel de edición del nodo seleccionado ── */}
        <div className="space-y-4">
          {selected === "inicio" && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold text-slate-900">▶ Inicio: ¿cuándo corre?</h2>
              <div className="space-y-3">
                <label className="block text-xs text-slate-600">
                  <span className="mb-1 block font-medium">Tipo de automatización</span>
                  <select
                    value={draft.kind}
                    onChange={(e) => changeKind(e.target.value as RuleKind)}
                    className={`${inputClass} w-full`}
                  >
                    {Object.entries(RULE_KINDS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-400">{kind.desc}</span>
                </label>

                <label className="block text-xs text-slate-600">
                  <span className="mb-1 block font-medium">Módulo del CRM</span>
                  <select
                    value={draft.module}
                    onChange={(e) => changeModule(e.target.value)}
                    disabled={draft.kind === "pipeline"}
                    className={`${inputClass} w-full disabled:bg-slate-50 disabled:text-slate-400`}
                  >
                    {Object.entries(MODULES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  {draft.kind === "pipeline" && (
                    <span className="mt-1 block text-[11px] text-slate-400">
                      Las reglas de pipeline siempre operan sobre oportunidades.
                    </span>
                  )}
                </label>

                {draft.kind === "pipeline" && (
                  <>
                    <label className="block text-xs text-slate-600">
                      <span className="mb-1 block font-medium">¿Qué gobierna?</span>
                      <select
                        value={draft.trigger}
                        onChange={(e) => changePipelineTrigger(e.target.value)}
                        className={`${inputClass} w-full`}
                      >
                        {Object.entries(PIPELINE_TRIGGERS).map(([k, t]) => (
                          <option key={k} value={k}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {PIPELINE_TRIGGERS[draft.trigger]?.hint}
                      </span>
                    </label>

                    <label className="block text-xs text-slate-600">
                      <span className="mb-1 block font-medium">Etapa del pipeline</span>
                      <select
                        value={draft.stageId}
                        onChange={(e) => patch({ stageId: e.target.value })}
                        className={`${inputClass} w-full`}
                      >
                        <option value="">— seleccionar etapa —</option>
                        {(options.stage_id ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-[11px] text-slate-400">
                        La regla queda ligada a la etapa aunque después la renombres.
                      </span>
                    </label>
                  </>
                )}

                {draft.kind === "workflow" && (
                  <label className="block text-xs text-slate-600">
                    <span className="mb-1 block font-medium">Evento que lo dispara</span>
                    <select
                      value={draft.trigger}
                      onChange={(e) => patch({ trigger: e.target.value })}
                      className={`${inputClass} w-full`}
                    >
                      {eventsForModule.map(([k, e]) => (
                        <option key={k} value={k}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </section>
          )}

          {selected === "condicion" && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-1 font-semibold text-slate-900">◆ Condición: ¿si se cumple qué?</h2>
              <p className="mb-3 text-xs text-slate-400">
                Sin condiciones, la automatización corre siempre. Los grupos anidados permiten
                combinar Y con O.
              </p>
              <ConditionGroupEditor
                group={draft.root}
                module={draft.module}
                options={options}
                onChange={(root) => patch({ root })}
              />
            </section>
          )}

          {typeof selected === "number" && draft.actions[selected] && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold text-slate-900">
                ⚡ Acción {selected + 1}: {kind.actions[draft.actions[selected].type]?.label}
              </h2>
              <ActionEditor
                action={draft.actions[selected]}
                spec={kind.actions[draft.actions[selected].type] ?? { label: draft.actions[selected].type, params: [] }}
                module={draft.module}
                options={options}
                onChange={(a) =>
                  patch({ actions: draft.actions.map((old, j) => (j === selected ? a : old)) })
                }
              />
            </section>
          )}

          {selected === null && (
            <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">
              Haz clic en un nodo del diagrama para editarlo.
            </p>
          )}
        </div>
      </div>

      {/* Errores y guardar */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-1 text-xs font-semibold text-red-700">Antes de guardar:</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-red-600">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar automatización"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/automatizaciones")}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
