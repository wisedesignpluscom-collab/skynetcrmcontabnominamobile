import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { catalogCategories } from "@/lib/catalog";
import { ruleDefs, ensureRules } from "@/lib/automations";
import {
  addCatalogOption,
  renameCatalogOption,
  toggleCatalogOption,
  addStage,
  updateStage,
  moveStage,
  deleteStage,
  toggleAutomationRule,
  saveAutomationRule,
} from "./actions";

export const dynamic = "force-dynamic";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default async function ConfiguracionPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/");

  await ensureRules();
  const [options, stages, rules] = await Promise.all([
    prisma.catalogOption.findMany({ orderBy: [{ order: "asc" }, { label: "asc" }] }),
    prisma.pipelineStage.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { deals: true } } },
    }),
    prisma.automationRule.findMany(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-sm text-slate-500">
          Adapta las listas de selección del sistema al nicho de cada cliente. Solo los
          administradores ven esta página.
        </p>
      </header>

      {/* Catálogos */}
      <div className="grid gap-6 lg:grid-cols-2">
        {catalogCategories.map((cat) => {
          const items = options.filter((o) => o.category === cat.key);
          return (
            <section
              key={cat.key}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold text-slate-900">{cat.title}</h2>
              <p className="mb-4 text-xs text-slate-400">{cat.hint}</p>

              <form action={addCatalogOption} className="mb-4 flex gap-2">
                <input type="hidden" name="category" value={cat.key} />
                <input
                  name="label"
                  required
                  placeholder="Nueva opción…"
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
                >
                  + Agregar
                </button>
              </form>

              <ul className="divide-y divide-slate-100">
                {items.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                    <form action={renameCatalogOption} className="flex flex-1 gap-2">
                      <input type="hidden" name="optionId" value={o.id} />
                      <input
                        name="label"
                        defaultValue={o.label}
                        className={`${inputClass} w-full ${o.active ? "" : "opacity-50 line-through"}`}
                      />
                      <button
                        type="submit"
                        title="Guardar nombre"
                        className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                      >
                        Guardar
                      </button>
                    </form>
                    <form action={toggleCatalogOption}>
                      <input type="hidden" name="optionId" value={o.id} />
                      <button
                        type="submit"
                        title={o.active ? "Desactivar (deja de aparecer en los formularios)" : "Reactivar"}
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          o.active
                            ? "text-slate-400 hover:bg-slate-100"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {o.active ? "Desactivar" : "Reactivar"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {/* Etapas del pipeline */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Etapas del pipeline</h2>
          <p className="mb-4 text-xs text-slate-400">
            Renombra, colorea y reordena las etapas. Ganado y Perdido no se pueden eliminar
            porque disparan la posventa y las aprobaciones.
          </p>

          <form action={addStage} className="mb-4 flex gap-2">
            <input
              name="name"
              required
              placeholder="Nueva etapa…"
              className={`${inputClass} flex-1`}
            />
            <input
              type="color"
              name="color"
              defaultValue="#3b82f6"
              title="Color de la etapa"
              className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-300"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
            >
              + Agregar
            </button>
          </form>

          <ul className="divide-y divide-slate-100">
            {stages.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <form action={updateStage} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="stageId" value={s.id} />
                  <input
                    type="color"
                    name="color"
                    defaultValue={s.color}
                    title="Color"
                    className="h-8 w-9 shrink-0 cursor-pointer rounded-lg border border-slate-300"
                  />
                  <input name="name" defaultValue={s.name} className={`${inputClass} w-full`} />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                  >
                    Guardar
                  </button>
                </form>

                {s.type === "open" ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <form action={moveStage}>
                      <input type="hidden" name="stageId" value={s.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button type="submit" title="Subir" className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100">▲</button>
                    </form>
                    <form action={moveStage}>
                      <input type="hidden" name="stageId" value={s.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button type="submit" title="Bajar" className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100">▼</button>
                    </form>
                    {s._count.deals === 0 ? (
                      <form action={deleteStage}>
                        <input type="hidden" name="stageId" value={s.id} />
                        <button
                          type="submit"
                          title="Eliminar etapa (está vacía)"
                          className="rounded px-1.5 py-1 text-xs text-red-400 hover:bg-red-50"
                        >
                          ✕
                        </button>
                      </form>
                    ) : (
                      <span
                        title={`${s._count.deals} oportunidades dentro — no se puede eliminar`}
                        className="px-1.5 text-xs text-slate-300"
                      >
                        {s._count.deals}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {s.type === "won" ? "GANADO" : "PERDIDO"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Automatizaciones */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Automatizaciones</h2>
        <p className="mb-4 text-xs text-slate-400">
          Reglas que trabajan solas: crean tareas, programan seguimientos y escalan negocios sin
          que nadie tenga que acordarse.
        </p>
        <ul className="divide-y divide-slate-100">
          {ruleDefs.map((def) => {
            const rule = rules.find((r) => r.key === def.key);
            if (!rule) return null;
            return (
              <li key={def.key} className="flex flex-wrap items-center gap-3 py-3.5">
                <div className="min-w-52 flex-1">
                  <p className="text-sm font-medium text-slate-800">{def.title}</p>
                  <p className="text-xs text-slate-500">{def.desc}</p>
                </div>
                {(def.daysLabel || def.usesAmount) && (
                  <form action={saveAutomationRule} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="ruleKey" value={def.key} />
                    {def.daysLabel && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        {def.daysLabel}
                        <input
                          name="days"
                          type="number"
                          min="0"
                          defaultValue={rule.days}
                          className={`${inputClass} w-16 px-2 py-1.5 text-xs`}
                        />
                      </label>
                    )}
                    {def.usesAmount && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        Desde $
                        <input
                          name="amount"
                          type="number"
                          min="0"
                          defaultValue={rule.amount ?? 5000}
                          className={`${inputClass} w-20 px-2 py-1.5 text-xs`}
                        />
                      </label>
                    )}
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                    >
                      Guardar
                    </button>
                  </form>
                )}
                <form action={toggleAutomationRule}>
                  <input type="hidden" name="ruleKey" value={def.key} />
                  <button
                    type="submit"
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      rule.enabled
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {rule.enabled ? "● Activada" : "○ Desactivada"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-xs text-slate-400">
        💡 Desactivar una opción la quita de los formularios pero los registros antiguos que la
        usaban conservan su valor.
      </p>
    </div>
  );
}
