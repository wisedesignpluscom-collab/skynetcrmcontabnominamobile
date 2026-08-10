// Roster de trabajadores del cliente contable (Mis Consultores) + declaración
// de la base salarial del período en curso (Rule Engine — validación FAO).
// Base para el puente de datos a Galac (incrementos siguientes).

import {
  crearTrabajador,
  actualizarTrabajador,
  alternarActivoTrabajador,
  eliminarTrabajador,
} from "@/app/(crm)/empresas/trabajadores-actions";
import {
  guardarDeclaracion,
  marcarRiesgoManual,
  avanzarEstadoDeclaracion,
  resolverBloqueo,
} from "@/app/(crm)/empresas/nomina-actions";
import {
  motivoRiesgoLabels,
  estadoDeclaracionLabels,
  estadoDeclaracionClass,
  siguienteEstadoDeclaracion,
  ESTADO_BLOQUEADA,
} from "@/lib/nomina";
import { formatMulti, parseMulti } from "@/lib/multivalor";
import { etiquetaPeriodo } from "@/lib/fiscal/vencimientos";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

const money = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 });

export type DeclaracionRow = {
  baseDeclarada: number;
  riesgo: boolean;
  motivoRiesgo: string | null;
  notaRiesgo: string | null;
  estado: string;
  creadaPor: string | null;
  riesgoMarcadoPor: string | null;
};

export type TrabajadorRow = {
  id: string;
  cedula: string;
  nombre: string;
  cargo: string | null;
  fechaIngreso: Date | null;
  fechaEgreso: Date | null;
  activo: boolean;
  declaracion: DeclaracionRow | null;
};

export default function TrabajadoresPanel({
  companyId,
  periodoActual,
  trabajadores,
  puedeEliminar,
  puedeAprobar,
}: {
  companyId: string;
  periodoActual: string;
  trabajadores: TrabajadorRow[];
  puedeEliminar: boolean;
  puedeAprobar: boolean;
}) {
  const activos = trabajadores.filter((t) => t.activo).length;
  const enRiesgo = trabajadores.filter((t) => t.declaracion?.riesgo).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Trabajadores</h2>
        <p className="text-sm text-slate-500">
          {activos} activo{activos === 1 ? "" : "s"}
          {trabajadores.length !== activos && ` de ${trabajadores.length}`}
          {enRiesgo > 0 && (
            <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
              {enRiesgo} en riesgo · {etiquetaPeriodo(periodoActual)}
            </span>
          )}
        </p>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Roster para la nómina de este cliente y base declarada del período en curso — control de
        riesgo de subdeclaración del FAO.
      </p>

      <form action={crearTrabajador} className="mb-5 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-6">
        <input type="hidden" name="companyId" value={companyId} />
        <input
          name="cedula"
          placeholder="V-12345678"
          required
          className={inputClass}
          aria-label="Cédula"
        />
        <input
          name="nombre"
          placeholder="Nombre y apellido"
          required
          className={`${inputClass} sm:col-span-2`}
          aria-label="Nombre"
        />
        <input name="cargo" placeholder="Cargo" className={inputClass} aria-label="Cargo" />
        <input name="fechaIngreso" type="date" className={inputClass} aria-label="Fecha de ingreso" />
        <button
          type="submit"
          className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          + Agregar
        </button>
      </form>

      {trabajadores.length === 0 ? (
        <p className="text-sm text-slate-400">Sin trabajadores registrados.</p>
      ) : (
        <ul className="space-y-2">
          {trabajadores.map((t) => {
            const d = t.declaracion;
            const motivos = parseMulti(d?.motivoRiesgo);
            // Solo cuenta como "ya marcado" si sigue activo — una marca
            // resuelta (riesgo=false) no debe esconder el formulario para
            // siempre, o nadie podría volver a marcarla si pasa de nuevo.
            const yaManual = !!d?.riesgo && motivos.includes("manual");
            const siguiente = d && d.estado !== ESTADO_BLOQUEADA ? siguienteEstadoDeclaracion(d.estado) : null;
            const bloquearia = !!(d && d.riesgo && siguiente === "aprobada");
            const puedeAvanzar = !!siguiente && (siguiente !== "aprobada" || bloquearia || puedeAprobar);
            const etiquetaBoton = !siguiente
              ? null
              : bloquearia
                ? "Enviar a revisión de riesgo →"
                : `Pasar a ${estadoDeclaracionLabels[siguiente].toLowerCase()} →`;
            return (
              <li key={t.id} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        t.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {t.activo ? "Activo" : "Inactivo"}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{t.nombre}</span>
                    <span className="text-xs text-slate-400">{t.cedula}</span>
                    {d && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estadoDeclaracionClass[d.estado] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {estadoDeclaracionLabels[d.estado] ?? d.estado}
                      </span>
                    )}
                    {d?.riesgo && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        ⚠ Riesgo: {formatMulti(d.motivoRiesgo, "").split(", ").map((m) => motivoRiesgoLabels[m] ?? m).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {d && puedeAvanzar && etiquetaBoton && (
                      <form action={avanzarEstadoDeclaracion}>
                        <input type="hidden" name="companyId" value={companyId} />
                        <input type="hidden" name="trabajadorId" value={t.id} />
                        <input type="hidden" name="periodo" value={periodoActual} />
                        <button
                          type="submit"
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            bloquearia
                              ? "bg-red-50 text-red-700 hover:bg-red-100"
                              : "bg-teal-50 text-teal-700 hover:bg-teal-100"
                          }`}
                        >
                          {etiquetaBoton}
                        </button>
                      </form>
                    )}
                    <form action={alternarActivoTrabajador}>
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                      >
                        {t.activo ? "Marcar egreso" : "Reactivar"}
                      </button>
                    </form>
                  </span>
                </div>

                {d?.estado === ESTADO_BLOQUEADA && puedeAprobar && (
                  <form
                    action={resolverBloqueo}
                    className="mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-red-100 bg-red-50/40 p-2"
                  >
                    <input type="hidden" name="companyId" value={companyId} />
                    <input type="hidden" name="trabajadorId" value={t.id} />
                    <input type="hidden" name="periodo" value={periodoActual} />
                    <label className="flex-1 text-xs text-red-700">
                      Resolver bloqueo (nota de gerencia/supervisión, obligatoria)
                      <input
                        name="notaResolucion"
                        required
                        placeholder="Ej.: se corrigió la base con el cliente, queda conforme…"
                        className={`${inputClass} mt-1 block w-full`}
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Resolver y pasar a revisión
                    </button>
                  </form>
                )}

                {d?.notaRiesgo && (
                  <p className="mb-2 rounded-lg bg-red-50/60 p-2 text-xs text-red-700">
                    <span className="font-semibold">Nota: </span>
                    {d.notaRiesgo}
                    {d.riesgoMarcadoPor && (
                      <span className="text-red-500"> — marcado por {d.riesgoMarcadoPor}</span>
                    )}
                  </p>
                )}
                {d?.creadaPor && (
                  <p className="mb-2 text-[11px] text-slate-400">Declaración cargada por {d.creadaPor}</p>
                )}

                <details className="mb-2 rounded-lg border border-slate-100">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600 hover:text-teal-700">
                    Base declarada — {etiquetaPeriodo(periodoActual)}
                    {d && <span className="ml-1 font-normal text-slate-400">(Bs {money.format(d.baseDeclarada)})</span>}
                  </summary>
                  <div className="space-y-2 border-t border-slate-100 p-3">
                    <form action={guardarDeclaracion} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="trabajadorId" value={t.id} />
                      <input type="hidden" name="periodo" value={periodoActual} />
                      <label className="text-xs text-slate-500">
                        Base declarada (Bs)
                        <input
                          name="baseDeclarada"
                          type="number"
                          min="0"
                          step="any"
                          defaultValue={d?.baseDeclarada ?? ""}
                          className={`${inputClass} mt-1 block w-40`}
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                      >
                        Guardar
                      </button>
                    </form>

                    {d && !yaManual && (
                      <form action={marcarRiesgoManual} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="companyId" value={companyId} />
                        <input type="hidden" name="trabajadorId" value={t.id} />
                        <input type="hidden" name="periodo" value={periodoActual} />
                        <label className="flex-1 text-xs text-slate-500">
                          Marcar en riesgo manualmente (justificación obligatoria)
                          <input
                            name="notaRiesgo"
                            required
                            placeholder="Ej.: el cliente insistió en declarar por debajo de lo real…"
                            className={`${inputClass} mt-1 block w-full`}
                          />
                        </label>
                        <button
                          type="submit"
                          className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          Marcar riesgo
                        </button>
                      </form>
                    )}
                  </div>
                </details>

                <details className="mb-2">
                  <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-teal-700">
                    Editar datos del trabajador
                  </summary>
                  <form action={actualizarTrabajador} className="mt-2 grid gap-2 sm:grid-cols-6">
                    <input type="hidden" name="companyId" value={companyId} />
                    <input type="hidden" name="id" value={t.id} />
                    <input name="cedula" defaultValue={t.cedula} className={inputClass} />
                    <input name="nombre" defaultValue={t.nombre} className={`${inputClass} sm:col-span-2`} />
                    <input name="cargo" defaultValue={t.cargo ?? ""} placeholder="Cargo" className={inputClass} />
                    <input
                      name="fechaIngreso"
                      type="date"
                      defaultValue={toDateInput(t.fechaIngreso)}
                      className={inputClass}
                      aria-label="Fecha de ingreso"
                    />
                    <input
                      name="fechaEgreso"
                      type="date"
                      defaultValue={toDateInput(t.fechaEgreso)}
                      className={inputClass}
                      aria-label="Fecha de egreso"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 sm:col-span-6 sm:w-fit"
                    >
                      Guardar
                    </button>
                  </form>
                </details>

                {puedeEliminar && (
                  <div className="flex justify-end">
                    <form action={eliminarTrabajador}>
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
