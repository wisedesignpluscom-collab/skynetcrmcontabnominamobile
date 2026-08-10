import { crearConcepto, actualizarConcepto, eliminarConcepto } from "@/app/(crm)/nomina/[companyId]/configuracion/actions";
import { MONEDAS, monedaLabels } from "@/lib/clientes";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export type ConceptoRow = {
  id: string;
  nombre: string;
  moneda: string;
  formulaAyuda: string | null;
  activo: boolean;
  isSystem: boolean;
};

export default function ConceptosPanel({
  companyId,
  conceptos,
  puedeEliminar,
}: {
  companyId: string;
  conceptos: ConceptoRow[];
  puedeEliminar: boolean;
}) {
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">
        Los estándar (⭐) vienen precargados y son editables/renombrables, pero no se eliminan — solo se desactivan.
        Los bonos propios de la empresa se pueden agregar, editar y borrar libremente.
      </p>

      <details className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700 hover:text-teal-700">
          + Nuevo bono propio
        </summary>
        <form action={crearConcepto} className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-3">
          <input type="hidden" name="companyId" value={companyId} />
          <label className="text-xs font-medium text-slate-500">
            Nombre
            <input name="nombre" required className={`${inputClass} mt-1 w-full`} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Moneda
            <select name="moneda" defaultValue="USD" className={`${inputClass} mt-1 w-full`}>
              {MONEDAS.map((m) => (
                <option key={m} value={m}>
                  {monedaLabels[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Fórmula (texto de ayuda)
            <input name="formulaAyuda" placeholder="Ej.: (sueldo/30)*dias" className={`${inputClass} mt-1 w-full`} />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 sm:col-span-3 sm:w-fit"
          >
            Crear bono
          </button>
        </form>
      </details>

      {conceptos.length === 0 ? (
        <p className="text-sm text-slate-400">Sin conceptos todavía.</p>
      ) : (
        <ul className="space-y-2">
          {conceptos.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-100 p-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  {c.isSystem && <span title="Concepto estándar">⭐</span>}
                  <span className={`text-sm font-medium ${c.activo ? "text-slate-800" : "text-slate-400 line-through"}`}>
                    {c.nombre}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {monedaLabels[c.moneda] ?? c.moneda}
                  </span>
                  {!c.activo && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Inactivo</span>
                  )}
                </span>
                {puedeEliminar && !c.isSystem && (
                  <form action={eliminarConcepto}>
                    <input type="hidden" name="companyId" value={companyId} />
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline">
                      Eliminar
                    </button>
                  </form>
                )}
              </div>
              {c.formulaAyuda && <p className="mb-2 font-mono text-xs text-slate-400">{c.formulaAyuda}</p>}

              <details>
                <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-teal-700">
                  Editar
                </summary>
                <form action={actualizarConcepto} className="mt-2 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="id" value={c.id} />
                  <input name="nombre" defaultValue={c.nombre} required className={`${inputClass}`} />
                  <select name="moneda" defaultValue={c.moneda} className={`${inputClass}`}>
                    {MONEDAS.map((m) => (
                      <option key={m} value={m}>
                        {monedaLabels[m]}
                      </option>
                    ))}
                  </select>
                  <input name="formulaAyuda" defaultValue={c.formulaAyuda ?? ""} className={`${inputClass}`} />
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" name="activo" defaultChecked={c.activo} className="h-4 w-4" />
                    Activo
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 sm:col-span-3 sm:w-fit"
                  >
                    Guardar
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
