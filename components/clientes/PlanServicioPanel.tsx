// Plan de servicios del cliente (F3): el honorario mensual y las obligaciones
// que la firma le lleva, cada una con su próxima fecha límite ya calculada por
// el motor de F2. Vive dentro de la ficha del cliente, no en una página aparte.

import {
  guardarPlan,
  cambiarEstadoPlan,
  agregarObligacionAlPlan,
  actualizarObligacionDelPlan,
  quitarObligacionDelPlan,
} from "@/app/(crm)/empresas/plan-actions";
import { ESTADOS_PLAN, estadoPlanLabels, estadoPlanClass } from "@/lib/planes";
import { formatMonto, MONEDAS, monedaLabels } from "@/lib/clientes";
import { etiquetaPeriodo, PERIODICIDADES } from "@/lib/fiscal/vencimientos";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });

const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

const periodicidadLabel = (k: string) => PERIODICIDADES.find((p) => p.key === k)?.label ?? k;

export type ObligacionDelPlan = {
  id: string;
  obligacionId: string;
  nombre: string;
  enteReceptor: string;
  periodicidad: string;
  diaLimiteOverride: number | null;
  // Próxima fecha límite con los datos cargados hoy (F2)
  vencimiento: { periodo: string; fecha: Date | null; motivo?: string };
};

export type PlanData = {
  id: string;
  honorarioMensual: number;
  moneda: string;
  fechaInicio: Date | null;
  estado: string;
  notas: string | null;
  obligaciones: ObligacionDelPlan[];
};

export default function PlanServicioPanel({
  companyId,
  monedaCliente,
  plan,
  disponibles,
}: {
  companyId: string;
  monedaCliente: string;
  plan: PlanData | null;
  // Obligaciones del catálogo que este plan todavía no cubre
  disponibles: { id: string; nombre: string; enteReceptor: string; periodicidad: string }[];
}) {
  if (!plan) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900">Plan de servicios</h2>
        <p className="mb-4 text-xs text-slate-400">
          Este cliente todavía no tiene plan. Al crearlo se le podrán asignar las obligaciones que
          la firma le lleva mes a mes.
        </p>
        <form action={guardarPlan} className="grid gap-2 sm:grid-cols-5">
          <input type="hidden" name="companyId" value={companyId} />
          <input
            name="honorarioMensual"
            type="number"
            min="0"
            step="any"
            placeholder="Honorario mensual"
            className={`${inputClass} sm:col-span-2`}
            aria-label="Honorario mensual"
          />
          <select name="moneda" defaultValue={monedaCliente} className={inputClass} aria-label="Moneda">
            {MONEDAS.map((m) => (
              <option key={m} value={m}>
                {monedaLabels[m]}
              </option>
            ))}
          </select>
          <input name="fechaInicio" type="date" className={inputClass} aria-label="Fecha de inicio" />
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Crear plan
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Plan de servicios</h2>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              estadoPlanClass[plan.estado] ?? "bg-slate-100 text-slate-600"
            }`}
          >
            {estadoPlanLabels[plan.estado] ?? plan.estado}
          </span>
          {ESTADOS_PLAN.filter((e) => e !== plan.estado).map((e) => (
            <form key={e} action={cambiarEstadoPlan}>
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="estado" value={e} />
              <button type="submit" className="text-xs font-medium text-slate-500 hover:underline">
                {e === "activo" ? "Reactivar" : e === "pausado" ? "Pausar" : "Cancelar"}
              </button>
            </form>
          ))}
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        {plan.estado === "activo"
          ? "Honorario recurrente y obligaciones que la firma le lleva a este cliente."
          : "Plan sin efecto: no genera casos del período ni factura mientras no esté activo."}
      </p>

      <form action={guardarPlan} className="mb-5 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-5">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="estado" value={plan.estado} />
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Honorario mensual
          </span>
          <input
            name="honorarioMensual"
            type="number"
            min="0"
            step="any"
            defaultValue={plan.honorarioMensual || ""}
            className={`${inputClass} w-full`}
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Moneda
          </span>
          <select name="moneda" defaultValue={plan.moneda} className={`${inputClass} w-full`}>
            {MONEDAS.map((m) => (
              <option key={m} value={m}>
                {monedaLabels[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Inicio
          </span>
          <input
            name="fechaInicio"
            type="date"
            defaultValue={toDateInput(plan.fechaInicio)}
            className={`${inputClass} w-full`}
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
          >
            Guardar
          </button>
        </div>
        <input
          name="notas"
          defaultValue={plan.notas ?? ""}
          placeholder="Notas del contrato…"
          className={`${inputClass} sm:col-span-5`}
        />
      </form>

      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          Obligaciones cubiertas ({plan.obligaciones.length})
        </h3>
        <p className="text-sm font-semibold text-teal-700">
          {formatMonto(plan.honorarioMensual, plan.moneda)}
          <span className="text-xs font-normal text-slate-400"> /mes</span>
        </p>
      </div>

      {plan.obligaciones.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400">
          Ninguna todavía: agrégalas abajo para que el sistema calcule sus vencimientos.
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {plan.obligaciones.map((o) => (
            <li key={o.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{o.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {o.enteReceptor} · {periodicidadLabel(o.periodicidad)} ·{" "}
                    {etiquetaPeriodo(o.vencimiento.periodo)}
                  </p>
                </div>
                <div className="text-right">
                  {o.vencimiento.fecha ? (
                    <p className="text-sm font-semibold text-teal-700">
                      {fechaCorta(o.vencimiento.fecha)}
                    </p>
                  ) : (
                    <p className="max-w-xs text-xs text-amber-700">{o.vencimiento.motivo}</p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <form action={actualizarObligacionDelPlan} className="flex items-center gap-2">
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="id" value={o.id} />
                  <label className="text-xs text-slate-500">
                    Día acordado
                    <input
                      name="diaLimiteOverride"
                      type="number"
                      min="1"
                      max="31"
                      defaultValue={o.diaLimiteOverride ?? ""}
                      placeholder="—"
                      className={`${inputClass} ml-2 w-16 py-1 text-center`}
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Aplicar
                  </button>
                </form>
                <form action={quitarObligacionDelPlan}>
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="id" value={o.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline"
                  >
                    Quitar del plan
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {disponibles.length > 0 ? (
        <form action={agregarObligacionAlPlan} className="flex flex-wrap gap-2">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="planId" value={plan.id} />
          <select name="obligacionId" required className={`${inputClass} min-w-0 flex-1`} aria-label="Obligación">
            {disponibles.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre} · {o.enteReceptor}
              </option>
            ))}
          </select>
          <input
            name="diaLimiteOverride"
            type="number"
            min="1"
            max="31"
            placeholder="Día"
            className={`${inputClass} w-20 text-center`}
            aria-label="Día acordado"
          />
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            + Agregar
          </button>
        </form>
      ) : (
        <p className="text-xs text-slate-400">
          El plan ya cubre todas las obligaciones activas del catálogo.
        </p>
      )}
    </section>
  );
}
