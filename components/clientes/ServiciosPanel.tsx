// Servicios individuales del cliente (F3): trabajos puntuales fuera del plan
// mensual, con su flujo cotizado → aprobado → en ejecución → entregado →
// facturado. El botón de avanzar muestra siempre el siguiente paso.

import {
  crearServicio,
  actualizarServicio,
  cambiarEstadoServicio,
  eliminarServicio,
} from "@/app/(crm)/empresas/plan-actions";
import {
  estadoServicioLabels,
  estadoServicioClass,
  siguienteEstadoServicio,
  totalPorMoneda,
  formatTotales,
} from "@/lib/planes";
import { formatMonto, MONEDAS, monedaLabels } from "@/lib/clientes";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });

export type ServicioRow = {
  id: string;
  tipo: string;
  descripcion: string | null;
  montoCotizado: number;
  moneda: string;
  estado: string;
  responsableId: string | null;
  responsableNombre: string | null;
  fechaEntrega: Date | null;
};

export default function ServiciosPanel({
  companyId,
  monedaCliente,
  servicios,
  tipos,
  usuarios,
  puedeEliminar,
}: {
  companyId: string;
  monedaCliente: string;
  servicios: ServicioRow[];
  tipos: string[];
  usuarios: { id: string; name: string }[];
  puedeEliminar: boolean;
}) {
  // Lo cotizado que todavía no se factura: el pendiente real por cobrar
  const enCurso = servicios.filter((s) => s.estado !== "facturado");
  const totales = totalPorMoneda(enCurso.map((s) => ({ moneda: s.moneda, monto: s.montoCotizado })));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Servicios individuales</h2>
        {enCurso.length > 0 && (
          <p className="text-sm font-semibold text-teal-700">
            {formatTotales(totales)}
            <span className="text-xs font-normal text-slate-400"> sin facturar</span>
          </p>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Trabajos puntuales fuera del plan mensual: se cotizan, se aprueban, se ejecutan y se
        facturan aparte.
      </p>

      <form action={crearServicio} className="mb-5 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-6">
        <input type="hidden" name="companyId" value={companyId} />
        <select name="tipo" required defaultValue="" className={`${inputClass} sm:col-span-2`} aria-label="Tipo de servicio">
          <option value="" disabled>
            Tipo de servicio…
          </option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          name="montoCotizado"
          type="number"
          min="0"
          step="any"
          placeholder="Monto"
          className={inputClass}
          aria-label="Monto cotizado"
        />
        <select name="moneda" defaultValue={monedaCliente} className={inputClass} aria-label="Moneda">
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {monedaLabels[m]}
            </option>
          ))}
        </select>
        <select name="responsableId" defaultValue="" className={inputClass} aria-label="Responsable">
          <option value="">Sin responsable</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input name="fechaEntrega" type="date" className={inputClass} aria-label="Fecha de entrega" />
        <input
          name="descripcion"
          placeholder="Descripción del trabajo…"
          className={`${inputClass} sm:col-span-5`}
        />
        <button
          type="submit"
          className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          + Agregar
        </button>
      </form>

      {servicios.length === 0 ? (
        <p className="text-sm text-slate-400">Sin servicios individuales registrados.</p>
      ) : (
        <ul className="space-y-2">
          {servicios.map((s) => {
            const siguiente = siguienteEstadoServicio(s.estado);
            return (
              <li key={s.id} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        estadoServicioClass[s.estado] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {estadoServicioLabels[s.estado] ?? s.estado}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{s.tipo}</span>
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    <span className="font-semibold text-slate-700">
                      {formatMonto(s.montoCotizado, s.moneda)}
                    </span>
                    {siguiente && (
                      <form action={cambiarEstadoServicio}>
                        <input type="hidden" name="companyId" value={companyId} />
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="estado" value={siguiente} />
                        <button
                          type="submit"
                          className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                        >
                          Pasar a {estadoServicioLabels[siguiente].toLowerCase()} →
                        </button>
                      </form>
                    )}
                  </span>
                </div>

                <form action={actualizarServicio} className="grid gap-2 sm:grid-cols-6">
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="id" value={s.id} />
                  <select name="tipo" defaultValue={s.tipo} className={`${inputClass} sm:col-span-2`}>
                    {[...new Set([s.tipo, ...tipos])].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    name="montoCotizado"
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={s.montoCotizado || ""}
                    className={inputClass}
                  />
                  <select name="moneda" defaultValue={s.moneda} className={inputClass}>
                    {MONEDAS.map((m) => (
                      <option key={m} value={m}>
                        {monedaLabels[m]}
                      </option>
                    ))}
                  </select>
                  <select name="responsableId" defaultValue={s.responsableId ?? ""} className={inputClass}>
                    <option value="">Sin responsable</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <input
                    name="fechaEntrega"
                    type="date"
                    defaultValue={toDateInput(s.fechaEntrega)}
                    className={inputClass}
                  />
                  <input
                    name="descripcion"
                    defaultValue={s.descripcion ?? ""}
                    placeholder="Descripción…"
                    className={`${inputClass} sm:col-span-5`}
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Guardar
                  </button>
                </form>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {s.responsableNombre ?? "Sin responsable"}
                    {s.fechaEntrega && ` · entrega ${fechaCorta(s.fechaEntrega)}`}
                  </span>
                  {puedeEliminar && (
                    <form action={eliminarServicio}>
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="font-medium text-slate-400 hover:text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
