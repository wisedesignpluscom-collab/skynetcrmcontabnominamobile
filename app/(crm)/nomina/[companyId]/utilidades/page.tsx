import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PantallaLottt from "@/components/nomina/PantallaLottt";
import { generarBorradorUtilidades, actualizarUtilidades, eliminarUtilidades } from "./actions";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { ESTADOS_UTILIDADES, estadoUtilidadesLabels, estadoUtilidadesClass } from "@/lib/lottt";

export const dynamic = "force-dynamic";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const money = (n: number) => `$${n.toFixed(2)}`;

export default async function UtilidadesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ anio?: string }>;
}) {
  const { companyId } = await params;
  const { anio: anioParam } = await searchParams;
  const anio = Number(anioParam) || new Date().getFullYear();

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) notFound();

  const [registros, session] = await Promise.all([
    prisma.registroUtilidades.findMany({
      where: { trabajador: { companyId }, anio },
      include: { trabajador: true },
      orderBy: { trabajador: { nombre: "asc" } },
    }),
    getSession(),
  ]);
  const puedeEliminar = canDelete(session?.role);

  return (
    <PantallaLottt
      companyId={companyId}
      titulo={`Utilidades ${anio}`}
      articulo="Art. 131-132 LOTTT"
      accionPrincipal={
        <form action={generarBorradorUtilidades} className="flex items-center gap-2">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="number" name="anio" defaultValue={anio} className={`${inputClass} w-20`} />
          <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            Generar borrador
          </button>
        </form>
      }
      logicaCalculo={
        <>
          <p>
            <strong>Días de utilidades (Art. 131-132):</strong> la ley pone el piso (30 días) y el techo (120 días); el
            número exacto para este cliente ya se configuró en Configuración de nómina. Se prorratea por los meses
            trabajados en el año y se valora al salario diario (base mensual ÷ 30).
          </p>
          <p>
            Simplificación: usa la última base declarada del año como salario de referencia — no promedia las 12
            declaraciones mensuales.
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
          Sin registros — pulsa &quot;Generar borrador&quot; para calcular las utilidades del año.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Empleado</th>
                <th className="px-4 py-2.5">Calculado</th>
                <th className="px-4 py-2.5">Pagado</th>
                <th className="px-4 py-2.5">Pendiente</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.trabajador.nombre}</td>
                  <td className="px-4 py-2.5">
                    {money(r.montoCalculado)} <span className="text-xs text-slate-400">({r.diasCalculados.toFixed(1)}d)</span>
                  </td>
                  <td className="px-4 py-2.5">{money(r.montoPagado)}</td>
                  <td className="px-4 py-2.5">{money(r.montoCalculado - r.montoPagado)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estadoUtilidadesClass[r.estado] ?? "bg-slate-100"}`}>
                      {estadoUtilidadesLabels[r.estado] ?? r.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <details>
                      <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-teal-700">
                        Editar
                      </summary>
                      <form action={actualizarUtilidades} className="mt-2 grid w-64 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <input type="hidden" name="companyId" value={companyId} />
                        <input type="hidden" name="id" value={r.id} />
                        <label className="text-[11px] text-slate-500">
                          Días calculados
                          <input name="diasCalculados" type="number" min="0" step="0.5" defaultValue={r.diasCalculados} className={`${inputClass} mt-0.5 w-full`} />
                        </label>
                        <label className="text-[11px] text-slate-500">
                          Monto calculado
                          <input name="montoCalculado" type="number" min="0" step="0.01" defaultValue={r.montoCalculado} className={`${inputClass} mt-0.5 w-full`} />
                        </label>
                        <label className="text-[11px] text-slate-500">
                          Monto pagado
                          <input name="montoPagado" type="number" min="0" step="0.01" defaultValue={r.montoPagado} className={`${inputClass} mt-0.5 w-full`} />
                        </label>
                        <label className="text-[11px] text-slate-500">
                          Fecha de pago
                          <input name="fechaPago" type="date" defaultValue={toDateInput(r.fechaPago)} className={`${inputClass} mt-0.5 w-full`} />
                        </label>
                        <label className="text-[11px] text-slate-500">
                          Estado
                          <select name="estado" defaultValue={r.estado} className={`${inputClass} mt-0.5 w-full`}>
                            {ESTADOS_UTILIDADES.map((e) => (
                              <option key={e} value={e}>
                                {estadoUtilidadesLabels[e]}
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
                      <form action={eliminarUtilidades} className="mt-1">
                        <input type="hidden" name="companyId" value={companyId} />
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline">
                          Eliminar
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PantallaLottt>
  );
}
