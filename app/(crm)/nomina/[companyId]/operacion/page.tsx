import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { crearCorrida } from "./actions";
import AsistenciaGrid, { type DiaColumna } from "@/components/nomina/AsistenciaGrid";
import CorridaResumen from "@/components/nomina/CorridaResumen";
import {
  periodoActualNomina,
  periodoSiguienteNomina,
  periodoAnteriorNomina,
  etiquetaPeriodoNomina,
  rangoPeriodoNomina,
  diasDelPeriodoNomina,
} from "@/lib/corridas";
import { frecuenciaPagoLabels, type FrecuenciaPago } from "@/lib/jornadas";
import { claveDia } from "@/lib/fiscal/vencimientos";

export const dynamic = "force-dynamic";

const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export default async function OperacionNominaPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ periodo?: string; ocultarFines?: string; fecha?: string }>;
}) {
  const { companyId } = await params;
  const { periodo: periodoParam, ocultarFines, fecha: fechaParam } = await searchParams;

  const config = await prisma.configuracionNomina.findUnique({ where: { companyId } });
  const frecuencia: FrecuenciaPago =
    config?.frecuenciaPago === "mensual" || config?.frecuenciaPago === "semanal" ? config.frecuenciaPago : "quincenal";

  const fechaPuntual = fechaParam ? new Date(`${fechaParam}T12:00:00`) : null;
  const periodo =
    fechaPuntual && !Number.isNaN(fechaPuntual.getTime())
      ? periodoActualNomina(frecuencia, fechaPuntual)
      : periodoParam || periodoActualNomina(frecuencia);
  const rango = rangoPeriodoNomina(periodo, frecuencia);
  const ocultarFinDeSemana = ocultarFines === "1";

  const base = `/nomina/${companyId}/operacion`;
  const linkPeriodo = (p: string) => `${base}?periodo=${p}${ocultarFinDeSemana ? "&ocultarFines=1" : ""}`;
  const anterior = periodoAnteriorNomina(periodo, frecuencia);
  const siguiente = periodoSiguienteNomina(periodo, frecuencia);

  const [trabajadores, asistencias, corridaDb, conceptos] = await Promise.all([
    prisma.trabajador.findMany({ where: { companyId, activo: true }, orderBy: { nombre: "asc" } }),
    rango
      ? prisma.asistenciaDia.findMany({
          where: { trabajador: { companyId }, fecha: { gte: rango.inicio, lte: rango.fin } },
        })
      : Promise.resolve([]),
    prisma.corridaNomina.findUnique({
      where: { companyId_periodo: { companyId, periodo } },
      include: { detalles: { include: { trabajador: true, lineas: { include: { concepto: true } } }, orderBy: { trabajador: { nombre: "asc" } } } },
    }),
    prisma.conceptoNomina.findMany({ where: { companyId, activo: true }, orderBy: { nombre: "asc" } }),
  ]);

  const dias: DiaColumna[] = rango
    ? diasDelPeriodoNomina(periodo, frecuencia)
        .filter((d) => !ocultarFinDeSemana || (d.getDay() !== 0 && d.getDay() !== 6))
        .map((d) => ({
          fecha: claveDia(d),
          etiqueta: `${d.getDate()} ${DIA_CORTO[d.getDay()]}`,
          finDeSemana: d.getDay() === 0 || d.getDay() === 6,
        }))
    : [];

  const horasPorCelda: Record<string, number> = {};
  for (const a of asistencias) horasPorCelda[`${a.trabajadorId}_${claveDia(a.fecha)}`] = a.horas;

  const corrida = corridaDb
    ? {
        estado: corridaDb.estado,
        totalBruto: corridaDb.totalBruto,
        totalDeducciones: corridaDb.totalDeducciones,
        totalNeto: corridaDb.totalNeto,
        auditoriaAlerta: corridaDb.auditoriaAlerta,
        auditoriaDetalle: corridaDb.auditoriaDetalle,
        detalles: corridaDb.detalles.map((d) => ({
          id: d.id,
          trabajadorId: d.trabajadorId,
          trabajadorNombre: d.trabajador.nombre,
          horasTrabajadas: d.horasTrabajadas,
          baseDevengada: d.baseDevengada,
          totalConceptos: d.totalConceptos,
          totalDeducciones: d.totalDeducciones,
          neto: d.neto,
          lineas: d.lineas.map((l) => ({
            id: l.id,
            conceptoNombre: l.concepto.nombre,
            horasParam: l.horasParam,
            diasParam: l.diasParam,
            monto: l.monto,
          })),
        })),
      }
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Link href={anterior ? linkPeriodo(anterior) : "#"} className="rounded-lg border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50">
            ←
          </Link>
          <p className="min-w-[180px] text-center text-sm font-semibold text-slate-800">{etiquetaPeriodoNomina(periodo, frecuencia)}</p>
          <Link href={siguiente ? linkPeriodo(siguiente) : "#"} className="rounded-lg border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50">
            →
          </Link>
        </div>

        <form action={base} className="flex items-center gap-2 text-xs text-slate-500">
          <input type="hidden" name="ocultarFines" value={ocultarFinDeSemana ? "1" : ""} />
          Ir a fecha
          <input
            type="date"
            name="fecha"
            defaultValue={fechaParam ?? ""}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-teal-500"
          />
          <button type="submit" className="rounded-lg border border-slate-300 px-2 py-1.5 font-medium text-slate-600 hover:bg-slate-50">
            Ir
          </button>
        </form>

        <Link
          href={`${base}?periodo=${periodo}${ocultarFinDeSemana ? "" : "&ocultarFines=1"}`}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${ocultarFinDeSemana ? "bg-teal-50 text-teal-700" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
        >
          Ocultar fines de semana
        </Link>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
          {frecuenciaPagoLabels[frecuencia]}
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-900">Asistencia — horas trabajadas por día</h2>
        <AsistenciaGrid companyId={companyId} periodo={periodo} dias={dias} trabajadores={trabajadores} horasPorCelda={horasPorCelda} />

        <form action={crearCorrida} className="mt-4 border-t border-slate-100 pt-4">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="periodo" value={periodo} />
          <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            {corrida ? "Recalcular corrida del período" : "Crear corrida del período"}
          </button>
        </form>
      </div>

      {corrida && <CorridaResumen companyId={companyId} corrida={corrida} conceptos={conceptos} />}
    </div>
  );
}
