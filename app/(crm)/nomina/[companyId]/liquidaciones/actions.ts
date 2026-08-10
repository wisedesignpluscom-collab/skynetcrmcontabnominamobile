"use server";

// Liquidaciones (2.6) — mismo patrón de acceso que el resto de nómina.
// Integra los otros dos módulos de esta etapa: las vacaciones pendientes
// salen de RegistroVacaciones (no se recalculan aparte) y las utilidades
// fraccionadas usan la misma fórmula que Utilidades para el año de egreso.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { canAccessCompany } from "@/lib/ownership";
import {
  aniosServicioCompletos,
  diasBonoVacacionalLegal,
  mesesTrabajadosEnAnio,
  diasUtilidadesProporcional,
  salarioDiario,
  prestacionesSocialesRetroactivo,
  MOTIVOS_LIQUIDACION,
  ESTADOS_LIQUIDACION,
} from "@/lib/lottt";
import { fechaLocal } from "@/lib/fiscal/vencimientos";
import { revalidatePath } from "next/cache";

async function sesionConAcceso(companyId: string) {
  const session = await getSession();
  if (!session || !companyId) return null;
  return (await canAccessCompany(session, companyId)) ? session : null;
}

function fechaDeFormulario(raw: string | null | undefined): Date | null {
  const texto = raw?.trim();
  if (!texto) return null;
  const [anio, mes, dia] = texto.split("-").map(Number);
  return anio && mes && dia ? fechaLocal(anio, mes, dia) : null;
}

export async function crearLiquidacion(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session) return;
  const trabajadorId = formData.get("trabajadorId") as string;
  const fechaEgreso = fechaDeFormulario(formData.get("fechaEgreso") as string);
  const motivo = formData.get("motivo") as string;
  if (!trabajadorId || !fechaEgreso || !(MOTIVOS_LIQUIDACION as readonly string[]).includes(motivo)) return;

  const trabajador = await prisma.trabajador.findUnique({ where: { id: trabajadorId } });
  if (!trabajador || trabajador.companyId !== companyId || !trabajador.fechaIngreso) return;

  const [config, ultimaDeclaracion, vacacionesPendientesAgg] = await Promise.all([
    prisma.configuracionNomina.findUnique({ where: { companyId } }),
    prisma.declaracionNomina.findFirst({ where: { trabajadorId }, orderBy: { periodo: "desc" } }),
    prisma.registroVacaciones.findMany({ where: { trabajadorId } }),
  ]);
  const baseMensual = ultimaDeclaracion?.baseDeclarada ?? 0;
  const diasUtilidadesAnio = config?.utilidadesDiasAnio ?? 30;
  const aniosCompletos = aniosServicioCompletos(trabajador.fechaIngreso, fechaEgreso);
  const diasBonoVacacional = diasBonoVacacionalLegal(aniosCompletos) + (config?.vacacionesDiasExtra ?? 0);

  const prestaciones = prestacionesSocialesRetroactivo({
    baseMensual,
    fechaIngreso: trabajador.fechaIngreso,
    fechaEgreso,
    diasUtilidadesAnio,
    diasBonoVacacional,
  });

  const diasVacacionesPendientes = vacacionesPendientesAgg.reduce((s, r) => s + (r.diasCorrespondientes - r.diasTomados), 0);
  const montoVacacionesPendientes = diasVacacionesPendientes * salarioDiario(baseMensual);

  const mesesAnioEgreso = mesesTrabajadosEnAnio(trabajador.fechaIngreso, fechaEgreso, fechaEgreso.getFullYear());
  const diasUtilidadesFraccion = diasUtilidadesProporcional(diasUtilidadesAnio, mesesAnioEgreso);
  const montoUtilidadesFraccionadas = diasUtilidadesFraccion * salarioDiario(baseMensual);

  const total = prestaciones.monto + montoVacacionesPendientes + montoUtilidadesFraccionadas;

  await prisma.liquidacion.create({
    data: {
      trabajadorId,
      fechaEgreso,
      motivo,
      aniosServicio: prestaciones.anios,
      salarioIntegralDiario: prestaciones.salarioIntegralDiario,
      montoPrestaciones: prestaciones.monto,
      diasVacacionesPendientes,
      montoVacacionesPendientes,
      montoUtilidadesFraccionadas,
      total,
      createdById: session.id,
      notas: (formData.get("notas") as string)?.trim() || null,
    },
  });
  revalidatePath(`/nomina/${companyId}/liquidaciones`);
}

export async function actualizarLiquidacion(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const registro = await prisma.liquidacion.findUnique({ where: { id }, include: { trabajador: true } });
  if (!registro || registro.trabajador.companyId !== companyId) return;

  const estado = formData.get("estado") as string;
  const montoPrestaciones = Number(formData.get("montoPrestaciones")) || 0;
  const montoVacacionesPendientes = Number(formData.get("montoVacacionesPendientes")) || 0;
  const montoUtilidadesFraccionadas = Number(formData.get("montoUtilidadesFraccionadas")) || 0;

  await prisma.liquidacion.update({
    where: { id },
    data: {
      montoPrestaciones,
      montoVacacionesPendientes,
      montoUtilidadesFraccionadas,
      total: montoPrestaciones + montoVacacionesPendientes + montoUtilidadesFraccionadas,
      estado: (ESTADOS_LIQUIDACION as readonly string[]).includes(estado) ? estado : registro.estado,
      fechaPago: fechaDeFormulario(formData.get("fechaPago") as string),
      notas: (formData.get("notas") as string)?.trim() || null,
    },
  });
  revalidatePath(`/nomina/${companyId}/liquidaciones`);
}

export async function eliminarLiquidacion(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session || !canDelete(session.role)) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const registro = await prisma.liquidacion.findUnique({ where: { id }, include: { trabajador: true } });
  if (!registro || registro.trabajador.companyId !== companyId) return;

  await prisma.liquidacion.delete({ where: { id } });
  revalidatePath(`/nomina/${companyId}/liquidaciones`);
}
