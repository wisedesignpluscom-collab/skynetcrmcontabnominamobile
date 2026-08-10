// Panel de Configuración del Rule Engine de nómina (validación FAO): salario
// mínimo vigente (histórico) y umbral de caída entre períodos. Mismo patrón
// que FiscalSettings.tsx.

import {
  addSalarioMinimo,
  deleteSalarioMinimo,
  saveConfigRiesgoNomina,
} from "@/app/(crm)/configuracion/nomina-actions";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });

export type SalarioMinimoRow = {
  id: string;
  vigenteDesde: Date;
  monto: number;
  moneda: string;
  notas: string | null;
};

export default function NominaRiesgoSettings({
  salarios,
  umbralCaidaPeriodo,
}: {
  salarios: SalarioMinimoRow[];
  umbralCaidaPeriodo: number; // fracción 0-1
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Riesgo de nómina — validación FAO</h2>
      <p className="mb-4 text-xs text-slate-400">
        El sistema nunca inventa un mínimo: si no hay salario mínimo cargado para la fecha, esa
        heurística no se evalúa. Los valores los publica el Ejecutivo — cárgalos aquí cuando
        cambien.
      </p>

      <div className="mb-5 rounded-lg border border-slate-100 bg-slate-50 p-3">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Salario mínimo vigente</h3>
        <form action={addSalarioMinimo} className="grid gap-2 sm:grid-cols-5">
          <input name="vigenteDesde" type="date" required className={inputClass} aria-label="Vigente desde" />
          <input
            name="monto"
            type="number"
            min="0"
            step="any"
            required
            placeholder="Monto"
            className={inputClass}
            aria-label="Monto"
          />
          <select name="moneda" defaultValue="Bs" className={inputClass} aria-label="Moneda">
            <option value="Bs">Bolívares (Bs)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
          <input name="notas" placeholder="Notas (opcional)" className={`${inputClass} sm:col-span-1`} />
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            + Agregar
          </button>
        </form>

        {salarios.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Sin salario mínimo cargado todavía.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {salarios.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
              >
                <span className="text-slate-700">
                  <span className="font-medium">Desde {fechaCorta(s.vigenteDesde)}</span>
                  <span className="text-slate-500">
                    {" "}
                    · {s.moneda} {s.monto.toLocaleString("es-VE")}
                  </span>
                  {s.notas && <span className="text-slate-400"> · {s.notas}</span>}
                </span>
                <form action={deleteSalarioMinimo}>
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Umbral de caída entre períodos</h3>
        <p className="mb-2 text-xs text-slate-400">
          Una base declarada que cae este % o más contra el período anterior del mismo trabajador
          se marca en riesgo, además de la marca manual del analista.
        </p>
        <form action={saveConfigRiesgoNomina} className="flex items-center gap-2">
          <input
            name="umbralCaidaPeriodo"
            type="number"
            min="1"
            max="99"
            step="1"
            defaultValue={Math.round(umbralCaidaPeriodo * 100)}
            className={`${inputClass} w-24`}
            aria-label="Umbral de caída (%)"
          />
          <span className="text-sm text-slate-500">%</span>
          <button
            type="submit"
            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
          >
            Guardar
          </button>
        </form>
      </div>
    </section>
  );
}
