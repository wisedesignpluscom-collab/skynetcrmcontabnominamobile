import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAutomations, canViewAutomationLog } from "@/lib/permissions";
import { redirect } from "next/navigation";
import {
  EVENT_TYPES,
  PIPELINE_TRIGGERS,
  RULE_KINDS,
  kindOfTrigger,
  type RuleKind,
} from "@/lib/engine/builder";
import { toggleAutomation, deleteAutomation, duplicateAutomation } from "./actions";
import ImportExportBar from "@/components/automations/ImportExportBar";

export const dynamic = "force-dynamic";

const jobStatus: Record<string, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-emerald-50 text-emerald-700" },
  error: { label: "Error", className: "bg-red-50 text-red-700" },
  pending: { label: "Pendiente", className: "bg-amber-50 text-amber-700" },
  running: { label: "Ejecutando", className: "bg-sky-50 text-sky-700" },
};

function triggerLabel(kind: RuleKind, trigger: string | null, stageName?: string | null): string {
  if (kind === "form") return "Mientras se llena el formulario";
  if (kind === "validation") return "Al guardar";
  if (kind === "pipeline") {
    const base = (trigger && PIPELINE_TRIGGERS[trigger]?.label) || trigger || "—";
    return stageName ? `${base} «${stageName}»` : base;
  }
  return (trigger && EVENT_TYPES[trigger]?.label) || trigger || "—";
}

export default async function AutomatizacionesPage() {
  const session = await getSession();
  // Ver la lista, el historial de auditoría y exportar: admin o supervisor.
  // Crear/editar/activar/eliminar/importar: solo admin (isAdmin más abajo).
  if (!session || !canViewAutomationLog(session.role)) redirect("/");
  const isAdmin = canManageAutomations(session.role);

  const [rules, jobs] = await Promise.all([
    prisma.rule.findMany({
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      include: {
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
        stage: { select: { name: true } },
      },
    }),
    prisma.workflowJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { rule: { select: { name: true } } },
    }),
  ]);

  const sections: { kind: RuleKind; rules: typeof rules }[] = (
    Object.keys(RULE_KINDS) as RuleKind[]
  ).map((kind) => ({ kind, rules: rules.filter((r) => kindOfTrigger(r.trigger) === kind) }));
  const unknown = rules.filter((r) => kindOfTrigger(r.trigger) === null);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Automatizaciones</h1>
          <p className="text-sm text-slate-500">
            Workflows y reglas construidos sin código: cuando pasa algo, si se cumple la
            condición, el CRM actúa solo.
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/automatizaciones/nueva"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
          >
            + Nueva automatización
          </Link>
        )}
      </header>

      <ImportExportBar canImport={isAdmin} />

      {!isAdmin && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          Vista de solo lectura. La gestión de automatizaciones (crear, editar, activar) es del
          administrador.
        </p>
      )}

      {sections.map(({ kind, rules: list }) => (
        <section
          key={kind}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="font-semibold text-slate-900">{RULE_KINDS[kind].plural}</h2>
          <p className="mb-3 text-xs text-slate-400">{RULE_KINDS[kind].desc}</p>

          {list.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">
              Todavía no hay {RULE_KINDS[kind].plural.toLowerCase()}.{" "}
              <Link href="/automatizaciones/nueva" className="text-teal-600 hover:underline">
                Crear la primera →
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((rule) => (
                <li key={rule.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-52 flex-1">
                    {isAdmin ? (
                      <Link
                        href={`/automatizaciones/${rule.id}`}
                        className="text-sm font-medium text-slate-800 hover:text-teal-700"
                      >
                        {rule.name}
                        {rule.isSystem && (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            SISTEMA
                          </span>
                        )}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-slate-800">
                        {rule.name}
                        {rule.isSystem && (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            SISTEMA
                          </span>
                        )}
                      </span>
                    )}
                    <p className="text-xs text-slate-500">
                      {triggerLabel(kind, rule.trigger, rule.stage?.name)}
                      {rule.description ? ` · ${rule.description}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {rule.createdBy?.name ? `Creada por ${rule.createdBy.name}` : "Creada por el sistema"}
                      {rule.updatedBy?.name ? ` · Editó ${rule.updatedBy.name}` : ""}
                    </p>
                  </div>

                  {isAdmin ? (
                    <Link
                      href={`/automatizaciones/${rule.id}`}
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                    >
                      Editar
                    </Link>
                  ) : (
                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        rule.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {rule.enabled ? "● Activada" : "○ Desactivada"}
                    </span>
                  )}
                  {isAdmin && (
                    <>
                      <form action={duplicateAutomation}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <button
                          type="submit"
                          title="Crear una copia desactivada para editarla con calma"
                          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                        >
                          Duplicar
                        </button>
                      </form>
                      <form action={toggleAutomation}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <button
                          type="submit"
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                            rule.enabled
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {rule.enabled ? "● Activada" : "○ Desactivada"}
                        </button>
                      </form>
                    </>
                  )}
                  {isAdmin && !rule.isSystem && (
                    <form action={deleteAutomation}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <button
                        type="submit"
                        title="Eliminar la automatización (el historial de ejecuciones se conserva)"
                        className="rounded px-1.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {unknown.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Otras reglas</h2>
          <p className="mb-3 text-xs text-slate-400">
            Reglas sin disparador reconocible (creadas por código). El Builder no las edita.
          </p>
          <ul className="divide-y divide-slate-100">
            {unknown.map((rule) => (
              <li key={rule.id} className="flex items-center gap-3 py-2.5">
                <p className="flex-1 text-sm text-slate-700">{rule.name}</p>
                {!isAdmin && (
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      rule.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {rule.enabled ? "● Activada" : "○ Desactivada"}
                  </span>
                )}
                {isAdmin && (
                <form action={toggleAutomation}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <button
                    type="submit"
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      rule.enabled
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {rule.enabled ? "● Activada" : "○ Desactivada"}
                  </button>
                </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Log de ejecuciones */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Últimas ejecuciones</h2>
        <p className="mb-3 text-xs text-slate-400">
          Cada acción encolada por un workflow queda registrada aquí con su resultado.
        </p>
        {jobs.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-400">
            Aún no se ha ejecutado ningún workflow.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 pr-3 font-semibold">Automatización</th>
                  <th className="py-2 pr-3 font-semibold">Acción</th>
                  <th className="py-2 pr-3 font-semibold">Estado</th>
                  <th className="py-2 font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const st = jobStatus[job.status] ?? {
                    label: job.status,
                    className: "bg-slate-100 text-slate-500",
                  };
                  return (
                    <tr key={job.id}>
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                        {job.createdAt.toLocaleString("es-VE", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="max-w-44 truncate py-2 pr-3 text-slate-700">
                        {job.rule?.name ?? "(regla eliminada)"}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{job.action}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.className}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="max-w-64 truncate py-2 text-slate-500">
                        {job.status === "error" ? job.lastError : job.detail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">
        💡 Las 5 automatizaciones clásicas del CRM (seguimiento de propuestas, leads fríos,
        posventa recurrente…) se administran en{" "}
        <Link href="/configuracion" className="text-teal-600 hover:underline">
          Configuración
        </Link>
        .
      </p>
    </div>
  );
}
