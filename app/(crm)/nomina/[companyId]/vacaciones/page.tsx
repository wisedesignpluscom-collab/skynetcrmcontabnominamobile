import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PantallaLottt from "@/components/nomina/PantallaLottt";
import { programarVacaciones, actualizarVacaciones, eliminarVacaciones } from "./actions";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { ESTADOS_VACACIONES, estadoVacacionesLabels, estadoVacacionesClass } from "@/lib/lottt";

export const dynamic = "force-dynamic";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const hoy = () => new Date().toISOString().slice(0, 10);

export default async function VacacionesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) notFound();

  const [trabajadores, registros, session] = await Promise.all([
    prisma.trabajador.findMany({ where: { companyId, activo: true }, orderBy: { nombre: "asc" } }),
    prisma.registroVacaciones.findMany({
      where: { trabajador: { companyId } },
      include: { trabajador: true },
      orderBy: [{ trabajador: { nombre: "asc" } }, { anioServicio: "desc" }],
    }),
    getSession(),
  ]);
  const puedeEliminar = canDelete(session?.role);

  return (
    <PantallaLottt
      companyId={companyId}
      titulo="Vacaciones"
      articulo="Art. 190-192 LOTTT"
      accionPrincipal={
        <details className="relative">
          <summary className="cursor-pointer select-none rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            Programar vacaciones
          </summary>
          <form
            action={programarVacaciones}
            className="absolute right-0 z-10 mt-2 grid w-80 gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
          >
            <input type="hidden" name="companyId" value={companyId} />
            <label className="text-xs font-medium text-slate-500">
              Empleado
              <select name="trabajadorId" required className={`${inputClass} mt-1 w-full`}>
                {trabajadores.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Fecha de corte (aniversario)
              <input name="fechaCorte" type="date" required defaultValue={hoy()} className={`${inputClass} mt-1 w-full`} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Días correspondientes (déjalo vacío para sugerir según antigüedad)
              <input name="diasCorrespondientes" type="number" min="0" className={`${inputClass} mt-1 w-full`} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Fecha de inicio
              <input name="fechaInicio" type="date" className={`${inputClass} mt-1 w-full`} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Fecha de fin
              <input name="fechaFin" type="date" className={`${inputClass} mt-1 w-full`} />
            </label>
            <button type="submit" className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700">
              Guardar
            </button>
          </form>
        </details>
      }
      logicaCalculo={
        <>
          <p>
            <strong>Días de vacaciones (Art. 190):</strong> 15 días hábiles al cumplir el primer año de servicio, más 1
            día adicional por cada año de antigüedad, hasta un tope de 30 días (a partir del año 16). Se le suman los
            días extra que la firma configuró para este cliente en Configuración de nómina.
          </p>
          <p>
            ⚠️ Calculado con el mejor entendimiento disponible de la LOTTT — no verificado contra una fuente legal.
            Revisar antes de usar con un cliente real.
          </p>
        </>
      }
    >
      {registros.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
          Sin registros — pulsa &quot;Programar vacaciones&quot; para crear el primero.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Empleado</th>
                <th className="px-4 py-2.5">Período</th>
                <th className="px-4 py-2.5">Días tomados</th>
                <th className="px-4 py-2.5">Pendientes</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => {
                const pendientes = r.diasCorrespondientes - r.diasTomados;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.trabajador.nombre}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      Año {r.anioServicio} · {r.diasCorrespondientes}d correspondientes
                    </td>
                    <td className="px-4 py-2.5">{r.diasTomados}</td>
                    <td className="px-4 py-2.5">{pendientes}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estadoVacacionesClass[r.estado] ?? "bg-slate-100"}`}>
                        {estadoVacacionesLabels[r.estado] ?? r.estado}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <details>
                        <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-teal-700">
                          Editar
                        </summary>
                        <form action={actualizarVacaciones} className="mt-2 grid w-64 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <input type="hidden" name="companyId" value={companyId} />
                          <input type="hidden" name="id" value={r.id} />
                          <label className="text-[11px] text-slate-500">
                            Correspondientes
                            <input name="diasCorrespondientes" type="number" min="0" defaultValue={r.diasCorrespondientes} className={`${inputClass} mt-0.5 w-full`} />
                          </label>
                          <label className="text-[11px] text-slate-500">
                            Tomados
                            <input name="diasTomados" type="number" min="0" defaultValue={r.diasTomados} className={`${inputClass} mt-0.5 w-full`} />
                          </label>
                          <label className="text-[11px] text-slate-500">
                            Inicio
                            <input name="fechaInicio" type="date" defaultValue={toDateInput(r.fechaInicio)} className={`${inputClass} mt-0.5 w-full`} />
                          </label>
                          <label className="text-[11px] text-slate-500">
                            Fin
                            <input name="fechaFin" type="date" defaultValue={toDateInput(r.fechaFin)} className={`${inputClass} mt-0.5 w-full`} />
                          </label>
                          <label className="text-[11px] text-slate-500">
                            Estado
                            <select name="estado" defaultValue={r.estado} className={`${inputClass} mt-0.5 w-full`}>
                              {ESTADOS_VACACIONES.map((e) => (
                                <option key={e} value={e}>
                                  {estadoVacacionesLabels[e]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button type="submit" className="rounded-lg bg-teal-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
                            Guardar
                          </button>
                        </form>
                      </details>
                      {puedeEliminar && (
                        <form action={eliminarVacaciones} className="mt-1">
                          <input type="hidden" name="companyId" value={companyId} />
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline">
                            Eliminar
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PantallaLottt>
  );
}
