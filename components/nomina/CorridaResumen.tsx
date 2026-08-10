import { agregarLineaConcepto, eliminarLineaConcepto } from "@/app/(crm)/nomina/[companyId]/operacion/actions";
import { estadoCorridaLabels, estadoCorridaClass } from "@/lib/corridas";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const money = (n: number) => `$${n.toFixed(2)}`;

export type LineaData = { id: string; conceptoNombre: string; horasParam: number | null; diasParam: number | null; monto: number | null };
export type DetalleData = {
  id: string;
  trabajadorId: string;
  trabajadorNombre: string;
  horasTrabajadas: number;
  baseDevengada: number;
  totalConceptos: number;
  totalDeducciones: number;
  neto: number;
  lineas: LineaData[];
};
export type CorridaData = {
  estado: string;
  totalBruto: number;
  totalDeducciones: number;
  totalNeto: number;
  auditoriaAlerta: boolean;
  auditoriaDetalle: string | null;
  detalles: DetalleData[];
};

export default function CorridaResumen({
  companyId,
  corrida,
  conceptos,
}: {
  companyId: string;
  corrida: CorridaData;
  conceptos: { id: string; nombre: string; formulaAyuda: string | null }[];
}) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-900">Corrida del período</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estadoCorridaClass[corrida.estado] ?? "bg-slate-100"}`}>
            {estadoCorridaLabels[corrida.estado] ?? corrida.estado}
          </span>
        </div>
        <button
          type="button"
          disabled
          title="Próximamente — falta la especificación real de Galac"
          className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-300"
        >
          Exportar a Galac (TXT/XML)
        </button>
      </div>

      {corrida.auditoriaAlerta && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ Motor de auditoría: {corrida.auditoriaDetalle}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-lg font-bold text-slate-800">{money(corrida.totalBruto)}</p>
          <p className="text-xs text-slate-400">Bruto</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-lg font-bold text-slate-800">{money(corrida.totalDeducciones)}</p>
          <p className="text-xs text-slate-400">Deducciones</p>
        </div>
        <div className="rounded-lg bg-teal-50 p-3">
          <p className="text-lg font-bold text-teal-700">{money(corrida.totalNeto)}</p>
          <p className="text-xs text-teal-600">Neto</p>
        </div>
      </div>

      <ul className="space-y-2">
        {corrida.detalles.map((d) => (
          <li key={d.id} className="rounded-lg border border-slate-100 p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">{d.trabajadorNombre}</span>
              <span className="text-xs text-slate-500">
                {d.horasTrabajadas}h · base {money(d.baseDevengada)} + conceptos {money(d.totalConceptos)} − deducciones{" "}
                {money(d.totalDeducciones)} = <span className="font-semibold text-slate-700">{money(d.neto)}</span>
              </span>
            </div>

            {d.lineas.length > 0 && (
              <ul className="mb-2 space-y-1">
                {d.lineas.map((l) => (
                  <li key={l.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-xs">
                    <span>
                      {l.conceptoNombre}
                      {l.horasParam != null && ` · ${l.horasParam}h`}
                      {l.diasParam != null && ` · ${l.diasParam}d`}
                      {" — "}
                      {l.monto != null ? (
                        <span className="font-semibold">{money(l.monto)}</span>
                      ) : (
                        <span className="text-red-500">fórmula sin calcular</span>
                      )}
                    </span>
                    <form action={eliminarLineaConcepto}>
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="id" value={l.id} />
                      <button type="submit" className="text-slate-400 hover:text-red-600 hover:underline">
                        Quitar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <details>
              <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-teal-700">
                + Agregar concepto
              </summary>
              <form action={agregarLineaConcepto} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="companyId" value={companyId} />
                <input type="hidden" name="detalleId" value={d.id} />
                <select name="conceptoId" required className={inputClass}>
                  {conceptos.map((c) => (
                    <option key={c.id} value={c.id} title={c.formulaAyuda ?? ""}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <label className="text-[11px] text-slate-500">
                  Horas
                  <input name="horasParam" type="number" min="0" step="0.5" className={`${inputClass} mt-0.5 block w-16`} />
                </label>
                <label className="text-[11px] text-slate-500">
                  Días
                  <input name="diasParam" type="number" min="0" step="1" className={`${inputClass} mt-0.5 block w-16`} />
                </label>
                <button type="submit" className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
                  Agregar
                </button>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
