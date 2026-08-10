import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PantallaLottt from "@/components/nomina/PantallaLottt";
import { crearLiquidacion, actualizarLiquidacion, eliminarLiquidacion } from "./actions";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import {
  MOTIVOS_LIQUIDACION,
  motivoLiquidacionLabels,
  ESTADOS_LIQUIDACION,
  estadoLiquidacionLabels,
  estadoLiquidacionClass,
} from "@/lib/lottt";

export const dynamic = "force-dynamic";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const fechaCorta = (d: Date) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
const money = (n: number) => `$${n.toFixed(2)}`;
const hoy = () => new Date().toISOString().slice(0, 10);

export default async function LiquidacionesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) notFound();

  const [trabajadores, registros, session] = await Promise.all([
    prisma.trabajador.findMany({ where: { companyId }, orderBy: { nombre: "asc" } }),
    prisma.liquidacion.findMany({
      where: { trabajador: { companyId } },
      include: { trabajador: true },
      orderBy: { fechaEgreso: "desc" },
    }),
    getSession(),
  ]);
  const puedeEliminar = canDelete(session?.role);

  return (
    <PantallaLottt
      companyId={companyId}
      titulo="Liquidaciones"
      articulo="Art. 92 y 142 LOTTT"
      accionPrincipal={
        <details className="relative">
          <summary className="cursor-pointer select-none rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            Nueva liquidación
          </summary>
          <form
            action={crearLiquidacion}
            className="absolute right-0 z-10 mt-2 grid w-80 gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
          >
            <input type="hidden" name="companyId" value={companyId} />
            <label className="text-xs font-medium text-slate-500">
              Empleado
              <select name="trabajadorId" required className={`${inputClass} mt-1 w-full`}>
                {trabajadores.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                    {!t.activo && " (inactivo)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Fecha de egreso
              <input name="fechaEgreso" type="date" required defaultValue={hoy()} className={`${inputClass} mt-1 w-full`} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Motivo
              <select name="motivo" required className={`${inputClass} mt-1 w-full`}>
                {MOTIVOS_LIQUIDACION.map((m) => (
                  <option key={m} value={m}>
                    {motivoLiquidacionLabels[m]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700">
              Calcular y guardar
            </button>
          </form>
        </details>
      }
      logicaCalculo={
        <>
          <p>
            <strong>Prestaciones sociales (Art. 142):</strong> 30 días de salario integral (salario normal + alícuota
            de utilidades + alícuota de bono vacacional) por cada año de servicio, redondeando hacia arriba si la
            fracción restante supera los 6 meses.
          </p>
          <p>
            <strong>Solo cálculo retroactivo:</strong> este sistema NO lleva el histórico de garantía trimestral
            depositada (Art. 142 literal a) — la ley exige pagar el MAYOR entre esa garantía acumulada y el cálculo
            retroactivo. Si el cliente lleva esa garantía en otro sistema, hay que compararla a mano.
          </p>
          <p>
            <strong>Vacaciones pendientes:</strong> suma de días correspondientes menos tomados en Vacaciones, al
            salario diario normal (no integral).
          </p>
          <p>
            <strong>Utilidades fraccionadas:</strong> misma fórmula que Utilidades, prorrateada por los meses
            trabajados del año de egreso.
          </p>
          <p>
            ⚠️ Calculado con el mejor entendimiento disponible de la LOTTT — no verificado contra una fuente legal.
            Revisar con un abogado laboral antes de usar con un cliente real.
          </p>
        </>
      }
    >
      {registros.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
          Sin registros — pulsa &quot;Nueva liquidación&quot; para calcular la primera.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Empleado</th>
                <th className="px-4 py-2.5">Fecha egreso</th>
                <th className="px-4 py-2.5">Motivo</th>
                <th className="px-4 py-2.5">Prestaciones</th>
                <th className="px-4 py-2.5">Vacaciones</th>
                <th className="px-4 py-2.5">Utilidades</th>
                <th className="px-4 py-2.5">Total</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.trabajador.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-500">{fechaCorta(r.fechaEgreso)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{motivoLiquidacionLabels[r.motivo] ?? r.motivo}</td>
                  <td className="px-4 py-2.5">{money(r.montoPrestaciones)}</td>
                  <td className="px-4 py-2.5">
                    {money(r.montoVacacionesPendientes)} <span className="text-xs text-slate-400">({r.diasVacacionesPendientes.toFixed(1)}d)</span>
                  </td>
                  <td className="px-4 py-2.5">{money(r.montoUtilidadesFraccionadas)}</td>
                  <td className="px-4 py-2.5 font-semibold text-teal-700">{money(r.total)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estadoLiquidacionClass[r.estado] ?? "bg-slate-100"}`}>
                      {estadoLiquidacionLabels[r.estado] ?? r.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <details>
                      <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-teal-700">
                        Editar
                      </summary>
                      <form action={actualizarLiquidacion} className="mt-2 grid w-64 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <input type="hidden" name="companyId" value={companyId} />
                        <input type="hidden" name="id" value={r.id} />
                        <label className="text-[11px] text-slate-500">
                          Prestaciones
                          <input name="montoPrestaciones" type="number" min="0" step="0.01" defaultValue={r.montoPrestaciones} className={`${inputClass} mt-0.5 w-full`} />
                        </label>
                        <label className="text-[11px] text-slate-500">
                          Vacaciones pendientes
                          <input name="montoVacacionesPendientes" type="number" min="0" step="0.01" defaultValue={r.montoVacacionesPendientes} className={`${inputClass} mt-0.5 w-full`} />
                        </label>
                        <label className="text-[11px] text-slate-500">
                          Utilidades fraccionadas
                          <input name="montoUtilidadesFraccionadas" type="number" min="0" step="0.01" defaultValue={r.montoUtilidadesFraccionadas} className={`${inputClass} mt-0.5 w-full`} />
                        </label>
                        <label className="text-[11px] text-slate-500">
                          Fecha de pago
                          <input name="fechaPago" type="date" defaultValue={toDateInput(r.fechaPago)} className={`${inputClass} mt-0.5 w-full`} />
                        </label>
                        <label className="text-[11px] text-slate-500">
                          Estado
                          <select name="estado" defaultValue={r.estado} className={`${inputClass} mt-0.5 w-full`}>
                            {ESTADOS_LIQUIDACION.map((e) => (
                              <option key={e} value={e}>
                                {estadoLiquidacionLabels[e]}
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
                      <form action={eliminarLiquidacion} className="mt-1">
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
