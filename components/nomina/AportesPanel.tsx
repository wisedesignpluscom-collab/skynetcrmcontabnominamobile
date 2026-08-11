import { crearAporte, actualizarAporte, eliminarAporte } from "@/app/(crm)/nomina/[companyId]/configuracion/actions";
import { TIPOS_APORTE, tipoAporteLabels, type TipoAporte } from "@/lib/beneficiosNomina";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export type AporteRow = {
  id: string;
  tipo: string;
  nombre: string;
  porcentaje: number;
  activo: boolean;
  isSystem: boolean;
  ente: string | null;
  cuentaContable: string | null;
};

// Entes reconocidos por el generador de cuentas por pagar (Etapa 3.7) — el
// admin puede escribir otro valor a mano si hace falta.
const ENTES_SUGERIDOS = ["IVSS", "BANAVIH", "INCES", "SENIAT"];

function Grupo({
  companyId,
  tipo,
  aportes,
  puedeEliminar,
}: {
  companyId: string;
  tipo: TipoAporte;
  aportes: AporteRow[];
  puedeEliminar: boolean;
}) {
  return (
    <details open className="rounded-lg border border-slate-200">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700">
        {tipoAporteLabels[tipo]} ({aportes.length})
      </summary>
      <div className="space-y-2 border-t border-slate-100 p-4">
        {aportes.length === 0 && <p className="text-sm text-slate-400">Sin aportes en este grupo.</p>}
        {aportes.map((a) => (
          <div key={a.id} className="rounded-lg border border-slate-100 p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                {a.isSystem && <span title="Aporte estándar">⭐</span>}
                <span className={`text-sm font-medium ${a.activo ? "text-slate-800" : "text-slate-400 line-through"}`}>
                  {a.nombre}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {a.porcentaje}%
                </span>
                {a.ente ? (
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                    {a.ente}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400" title="Sin ente asignado: no genera cuenta por pagar">
                    Sin ente
                  </span>
                )}
              </span>
              {puedeEliminar && !a.isSystem && (
                <form action={eliminarAporte}>
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline">
                    Eliminar
                  </button>
                </form>
              )}
            </div>
            <details>
              <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-teal-700">
                Editar
              </summary>
              <form action={actualizarAporte} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="companyId" value={companyId} />
                <input type="hidden" name="id" value={a.id} />
                <input name="nombre" defaultValue={a.nombre} required className={`${inputClass} flex-1`} />
                <input
                  name="porcentaje"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={a.porcentaje}
                  required
                  className={`${inputClass} w-24`}
                />
                <input
                  name="ente"
                  defaultValue={a.ente ?? ""}
                  placeholder="Ente (IVSS, BANAVIH…)"
                  list="entes-sugeridos"
                  className={`${inputClass} w-40`}
                />
                <input
                  name="cuentaContable"
                  defaultValue={a.cuentaContable ?? ""}
                  placeholder="Cuenta contable"
                  className={`${inputClass} w-36`}
                />
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" name="activo" defaultChecked={a.activo} className="h-4 w-4" />
                  Activo
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Guardar
                </button>
              </form>
            </details>
          </div>
        ))}

        <details>
          <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-teal-700">
            + Nuevo aporte
          </summary>
          <form action={crearAporte} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="tipo" value={tipo} />
            <input name="nombre" placeholder="Nombre" required className={`${inputClass} flex-1`} />
            <input name="porcentaje" type="number" min="0" step="0.01" placeholder="%" required className={`${inputClass} w-24`} />
            <input name="ente" placeholder="Ente (IVSS, BANAVIH…)" list="entes-sugeridos" className={`${inputClass} w-40`} />
            <input name="cuentaContable" placeholder="Cuenta contable" className={`${inputClass} w-36`} />
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
            >
              Agregar
            </button>
          </form>
        </details>
      </div>
    </details>
  );
}

export default function AportesPanel({
  companyId,
  aportes,
  puedeEliminar,
}: {
  companyId: string;
  aportes: AporteRow[];
  puedeEliminar: boolean;
}) {
  return (
    <div className="space-y-4">
      <datalist id="entes-sugeridos">
        {ENTES_SUGERIDOS.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      {TIPOS_APORTE.map((tipo) => (
        <Grupo
          key={tipo}
          companyId={companyId}
          tipo={tipo}
          aportes={aportes.filter((a) => a.tipo === tipo)}
          puedeEliminar={puedeEliminar}
        />
      ))}
    </div>
  );
}
