"use server";

// Operación de Nómina (2.5): grid de asistencia + corrida del período.
// Mismo patrón de acceso que el resto del módulo de nómina: quien puede ver
// el cliente opera su nómina.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canAccessCompany } from "@/lib/ownership";
import {
  rangoPeriodoNomina,
  mesDeclaracionDelPeriodo,
  baseProrrateada,
  auditarCorrida,
  periodoAnteriorNomina,
} from "@/lib/corridas";
import { esFrecuenciaPago, type FrecuenciaPago } from "@/lib/jornadas";
import { diasDelMes, fechaLocal } from "@/lib/fiscal/vencimientos";
import { evaluarFormulaConcepto } from "@/lib/formulasNomina";
import { calcularAportesPeriodo } from "@/lib/aportesPatronales";
import { salarioMinimoVigente } from "@/lib/nomina";
import { revalidatePath } from "next/cache";

async function sesionConAcceso(companyId: string) {
  const session = await getSession();
  if (!session || !companyId) return null;
  return (await canAccessCompany(session, companyId)) ? session : null;
}

// "h_<trabajadorId>_<YYYY-MM-DD>" → horas del día. Un solo submit del grid
// completo; las celdas vacías o en 0 no generan fila (evita basura).
export async function guardarAsistencia(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;

  const celdas: { trabajadorId: string; fecha: string; horas: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("h_")) continue;
    const resto = key.slice(2);
    const sep = resto.lastIndexOf("_");
    if (sep < 0) continue;
    const trabajadorId = resto.slice(0, sep);
    const fecha = resto.slice(sep + 1);
    const horas = Number(value);
    if (!Number.isFinite(horas)) continue;
    celdas.push({ trabajadorId, fecha, horas: Math.max(0, horas) });
  }

  // Los trabajadores de la celda deben ser de esta empresa — cruce contra el
  // roster real en vez de confiar en el nombre del campo.
  const idsValidos = new Set(
    (await prisma.trabajador.findMany({ where: { companyId }, select: { id: true } })).map((t) => t.id)
  );

  await Promise.all(
    celdas
      .filter((c) => idsValidos.has(c.trabajadorId))
      .map((c) => {
        const [anio, mes, dia] = c.fecha.split("-").map(Number);
        if (!anio || !mes || !dia) return Promise.resolve();
        const fecha = fechaLocal(anio, mes, dia);
        return prisma.asistenciaDia.upsert({
          where: { trabajadorId_fecha: { trabajadorId: c.trabajadorId, fecha } },
          create: { trabajadorId: c.trabajadorId, fecha, horas: c.horas },
          update: { horas: c.horas },
        });
      })
  );
  revalidatePath(`/nomina/${companyId}/operacion`);
}

// ── Cálculo de la corrida ────────────────────────────────────────────────────

async function recalcularDetalle(detalleId: string) {
  const detalle = await prisma.corridaDetalle.findUniqueOrThrow({
    where: { id: detalleId },
    include: { lineas: true, corrida: { select: { companyId: true } } },
  });
  const totalConceptos = detalle.lineas.reduce((s, l) => s + (l.monto ?? 0), 0);
  const baseParaDeducir = detalle.baseDevengada + totalConceptos;

  const aportes = await prisma.aporteLegal.findMany({
    where: { companyId: detalle.corrida.companyId, tipo: "trabajador", activo: true },
  });
  const totalDeducciones = aportes.reduce((s, a) => s + (baseParaDeducir * a.porcentaje) / 100, 0);
  const neto = baseParaDeducir - totalDeducciones;

  await prisma.corridaDetalle.update({
    where: { id: detalleId },
    data: { totalConceptos, totalDeducciones, neto },
  });
  return { corridaId: detalle.corridaId };
}

async function recalcularCorrida(corridaId: string) {
  const corrida = await prisma.corridaNomina.findUniqueOrThrow({
    where: { id: corridaId },
    include: { detalles: true },
  });
  const totalBruto = corrida.detalles.reduce((s, d) => s + d.baseDevengada + d.totalConceptos, 0);
  const totalDeducciones = corrida.detalles.reduce((s, d) => s + d.totalDeducciones, 0);
  const totalNeto = corrida.detalles.reduce((s, d) => s + d.neto, 0);

  const config = await prisma.configuracionNomina.findUnique({ where: { companyId: corrida.companyId } });
  const frecuencia: FrecuenciaPago = esFrecuenciaPago(config?.frecuenciaPago) ? config!.frecuenciaPago : "quincenal";
  const periodoAnterior = periodoAnteriorNomina(corrida.periodo, frecuencia);
  const corridaAnterior = periodoAnterior
    ? await prisma.corridaNomina.findUnique({ where: { companyId_periodo: { companyId: corrida.companyId, periodo: periodoAnterior } } })
    : null;
  const auditoria = auditarCorrida({ totalNeto, totalNetoAnterior: corridaAnterior?.totalNeto ?? null });

  await prisma.corridaNomina.update({
    where: { id: corridaId },
    data: {
      totalBruto,
      totalDeducciones,
      totalNeto,
      auditoriaAlerta: auditoria.alerta,
      auditoriaDetalle: auditoria.detalle,
    },
  });

  await generarAportesPorPagar(corrida.id, corrida.companyId, corrida.detalles, corrida.moneda, corrida.fechaFin);
}

// Cuentas por pagar reales de nómina (Etapa 3.7): retención del trabajador +
// aporte patronal, sumados por ente (IVSS/BANAVIH/INCES/SENIAT), con la
// cuenta contable ya resuelta — reemplaza el estimado en vivo que solo
// miraba la pata del trabajador. Se regenera cada vez que la corrida se
// recalcula; idempotente por [corridaId, ente] y nunca toca `estadoPago`/
// `fechaPago` de un registro que ya existía (no se "des-paga" nada solo por
// recalcular).
async function generarAportesPorPagar(
  corridaId: string,
  companyId: string,
  detalles: { baseDevengada: number; totalConceptos: number }[],
  moneda: string,
  fechaReferencia: Date
) {
  const [aportesLegales, historialSalarioMinimo] = await Promise.all([
    prisma.aporteLegal.findMany({ where: { companyId, activo: true, ente: { not: null } } }),
    prisma.salarioMinimo.findMany(),
  ]);
  if (aportesLegales.length === 0) return;

  const salarioMinimo = salarioMinimoVigente(
    historialSalarioMinimo.map((s) => ({ vigenteDesde: s.vigenteDesde, monto: s.monto })),
    fechaReferencia
  );

  const totales = calcularAportesPeriodo(
    detalles.map((d) => ({ baseParaAporte: d.baseDevengada + d.totalConceptos })),
    aportesLegales.map((a) => ({
      ente: a.ente,
      tipo: a.tipo as "trabajador" | "patronal",
      porcentaje: a.porcentaje,
      cuentaContable: a.cuentaContable,
    })),
    salarioMinimo?.monto ?? null
  );

  for (const t of totales) {
    await prisma.aportePorPagar.upsert({
      where: { corridaId_ente: { corridaId, ente: t.ente } },
      create: {
        corridaId,
        companyId,
        ente: t.ente,
        montoTrabajador: t.montoTrabajador,
        montoPatronal: t.montoPatronal,
        montoTotal: t.montoTotal,
        moneda,
        cuentaContable: t.cuentaContable,
      },
      update: {
        montoTrabajador: t.montoTrabajador,
        montoPatronal: t.montoPatronal,
        montoTotal: t.montoTotal,
        moneda,
        cuentaContable: t.cuentaContable,
      },
    });
  }
}

export async function crearCorrida(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session) return;
  const periodo = (formData.get("periodo") as string)?.trim();
  if (!periodo) return;

  const config = await prisma.configuracionNomina.findUnique({ where: { companyId } });
  const frecuencia: FrecuenciaPago = esFrecuenciaPago(config?.frecuenciaPago) ? config!.frecuenciaPago : "quincenal";
  const rango = rangoPeriodoNomina(periodo, frecuencia);
  const mesDeclaracion = mesDeclaracionDelPeriodo(periodo, frecuencia);
  if (!rango || !mesDeclaracion) return;

  const [anioMes, mesMes] = mesDeclaracion.split("-").map(Number);
  const diasMes = diasDelMes(anioMes, mesMes);
  const diasPeriodo = Math.round((rango.fin.getTime() - rango.inicio.getTime()) / 86400000) + 1;

  const trabajadores = await prisma.trabajador.findMany({ where: { companyId, activo: true } });

  const corrida = await prisma.corridaNomina.upsert({
    where: { companyId_periodo: { companyId, periodo } },
    create: {
      companyId,
      periodo,
      fechaInicio: rango.inicio,
      fechaFin: rango.fin,
      moneda: config?.monedaSalario ?? "USD",
      estado: "calculada",
      createdById: session.id,
    },
    update: { estado: "calculada" },
  });

  for (const t of trabajadores) {
    const asistencias = await prisma.asistenciaDia.findMany({
      where: { trabajadorId: t.id, fecha: { gte: rango.inicio, lte: rango.fin } },
    });
    const horasTrabajadas = asistencias.reduce((s, a) => s + a.horas, 0);

    const declaracion = await prisma.declaracionNomina.findUnique({
      where: { trabajadorId_periodo: { trabajadorId: t.id, periodo: mesDeclaracion } },
    });
    const baseDevengada = baseProrrateada(declaracion?.baseDeclarada ?? 0, diasPeriodo, diasMes);

    const detalle = await prisma.corridaDetalle.upsert({
      where: { corridaId_trabajadorId: { corridaId: corrida.id, trabajadorId: t.id } },
      create: { corridaId: corrida.id, trabajadorId: t.id, horasTrabajadas, baseDevengada, baseMensualReferencia: declaracion?.baseDeclarada ?? 0 },
      update: { horasTrabajadas, baseDevengada, baseMensualReferencia: declaracion?.baseDeclarada ?? 0 },
    });
    await recalcularDetalle(detalle.id);
  }

  await recalcularCorrida(corrida.id);
  revalidatePath(`/nomina/${companyId}/operacion`);
}

// ── Líneas de concepto (agregadas a mano, calculadas con la fórmula real) ───

export async function agregarLineaConcepto(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const detalleId = formData.get("detalleId") as string;
  const conceptoId = formData.get("conceptoId") as string;
  if (!detalleId || !conceptoId) return;

  const detalle = await prisma.corridaDetalle.findUnique({
    where: { id: detalleId },
    include: { corrida: { select: { companyId: true } } },
  });
  if (!detalle || detalle.corrida.companyId !== companyId) return;
  const concepto = await prisma.conceptoNomina.findUnique({ where: { id: conceptoId } });
  if (!concepto || concepto.companyId !== companyId) return;

  const horasParam = formData.get("horasParam") ? Number(formData.get("horasParam")) : undefined;
  const diasParam = formData.get("diasParam") ? Number(formData.get("diasParam")) : undefined;
  const monto = evaluarFormulaConcepto(concepto.formulaAyuda, {
    sueldo: detalle.baseMensualReferencia,
    horas: horasParam,
    dias: diasParam,
  });

  await prisma.corridaLinea.create({
    data: { detalleId, conceptoId, horasParam: horasParam ?? null, diasParam: diasParam ?? null, monto },
  });
  const { corridaId } = await recalcularDetalle(detalleId);
  await recalcularCorrida(corridaId);
  revalidatePath(`/nomina/${companyId}/operacion`);
}

// ── Cuentas por pagar (Etapa 3.7) ────────────────────────────────────────────

export async function marcarAportePagado(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const aporte = await prisma.aportePorPagar.findUnique({ where: { id }, select: { companyId: true } });
  if (!aporte || aporte.companyId !== companyId) return;

  await prisma.aportePorPagar.update({
    where: { id },
    data: { estadoPago: "pagado", fechaPago: new Date() },
  });
  revalidatePath(`/nomina/${companyId}/reportes`);
}

export async function revertirPagoAporte(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const aporte = await prisma.aportePorPagar.findUnique({ where: { id }, select: { companyId: true } });
  if (!aporte || aporte.companyId !== companyId) return;

  await prisma.aportePorPagar.update({
    where: { id },
    data: { estadoPago: "pendiente", fechaPago: null },
  });
  revalidatePath(`/nomina/${companyId}/reportes`);
}

export async function eliminarLineaConcepto(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const linea = await prisma.corridaLinea.findUnique({
    where: { id },
    include: { detalle: { include: { corrida: { select: { companyId: true } } } } },
  });
  if (!linea || linea.detalle.corrida.companyId !== companyId) return;

  const detalleId = linea.detalleId;
  await prisma.corridaLinea.delete({ where: { id } });
  const { corridaId } = await recalcularDetalle(detalleId);
  await recalcularCorrida(corridaId);
  revalidatePath(`/nomina/${companyId}/operacion`);
}
