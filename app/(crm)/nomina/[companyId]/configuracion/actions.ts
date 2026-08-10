"use server";

// Configuración de nómina del cliente (2.3: País y monedas, Horarios y
// jornadas). Mismo patrón que plan-actions.ts: quien puede ver el cliente
// gestiona su configuración; borrar una jornada sigue siendo potestad de
// gerencia y supervisión.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { canAccessCompany } from "@/lib/ownership";
import { esFrecuenciaPago, DIAS_SEMANA } from "@/lib/jornadas";
import {
  PLANTILLA_CUENTAS_CONTABLES,
  TIPOS_DISTRIBUCION_UTILIDADES,
  TIPOS_APORTE,
  CONCEPTOS_ESTANDAR,
  APORTES_ESTANDAR,
} from "@/lib/beneficiosNomina";
import { revalidatePath } from "next/cache";

async function sesionConAcceso(companyId: string) {
  const session = await getSession();
  if (!session || !companyId) return null;
  return (await canAccessCompany(session, companyId)) ? session : null;
}

const MONEDAS_VALIDAS = ["USD", "Bs"];

function esDuplicado(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export async function guardarConfiguracionNomina(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;

  const frecuenciaPago = formData.get("frecuenciaPago") as string;
  const monedaSalario = formData.get("monedaSalario") as string;
  const monedaBonos = formData.get("monedaBonos") as string;
  const monedaDeducciones = formData.get("monedaDeducciones") as string;
  if (!esFrecuenciaPago(frecuenciaPago)) return;
  if (![monedaSalario, monedaBonos, monedaDeducciones].every((m) => MONEDAS_VALIDAS.includes(m))) return;

  await prisma.configuracionNomina.upsert({
    where: { companyId },
    create: {
      companyId,
      frecuenciaPago,
      monedaSalario,
      monedaBonos,
      monedaDeducciones,
      notas: (formData.get("notas") as string)?.trim() || null,
    },
    update: {
      frecuenciaPago,
      monedaSalario,
      monedaBonos,
      monedaDeducciones,
      notas: (formData.get("notas") as string)?.trim() || null,
    },
  });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

function datosJornada(formData: FormData) {
  return {
    nombre: (formData.get("nombre") as string)?.trim(),
    horaEntrada: (formData.get("horaEntrada") as string)?.trim(),
    horaSalida: (formData.get("horaSalida") as string)?.trim(),
    descansoMinutos: Math.max(0, Number(formData.get("descansoMinutos")) || 0),
    metodo: (formData.get("metodo") as string) === "otro" ? "otro" : "fija",
    toleranciaMinutos: formData.get("toleranciaMinutos")
      ? Math.max(0, Number(formData.get("toleranciaMinutos")))
      : null,
    umbralMedioDiaHoras: formData.get("umbralMedioDiaHoras")
      ? Math.max(0, Number(formData.get("umbralMedioDiaHoras")))
      : null,
    nocturna: formData.get("nocturna") === "on",
    diasOperacion:
      (formData.getAll("dias") as string[])
        .filter((d) => (DIAS_SEMANA as readonly string[]).includes(d))
        .join(",") || null,
  };
}

export async function crearJornada(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const datos = datosJornada(formData);
  if (!datos.nombre || !datos.horaEntrada || !datos.horaSalida) return;

  await prisma.jornada.create({ data: { companyId, ...datos } });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

export async function actualizarJornada(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const j = await prisma.jornada.findUnique({ where: { id }, select: { companyId: true } });
  if (!j || j.companyId !== companyId) return;

  const datos = datosJornada(formData);
  if (!datos.nombre || !datos.horaEntrada || !datos.horaSalida) return;

  await prisma.jornada.update({ where: { id }, data: datos });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

export async function eliminarJornada(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session || !canDelete(session.role)) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const j = await prisma.jornada.findUnique({ where: { id }, select: { companyId: true } });
  if (!j || j.companyId !== companyId) return;

  await prisma.jornada.delete({ where: { id } });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

// ── 2.4 — Cuentas contables ──────────────────────────────────────────────
export async function guardarCuentasContables(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;

  const datos = {
    cuentaGastoSueldos: (formData.get("cuentaGastoSueldos") as string)?.trim() || null,
    cuentaNominaPorPagarVES: (formData.get("cuentaNominaPorPagarVES") as string)?.trim() || null,
    cuentaNominaPorPagarUSD: (formData.get("cuentaNominaPorPagarUSD") as string)?.trim() || null,
    cuentaDeduccionesPorPagar: (formData.get("cuentaDeduccionesPorPagar") as string)?.trim() || null,
  };
  await prisma.configuracionNomina.upsert({
    where: { companyId },
    create: { companyId, ...datos },
    update: datos,
  });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

// Plantilla estándar — no es IA, es un catálogo fijo de códigos genéricos
// (ver lib/beneficiosNomina.ts) que el analista edita después si lo necesita.
export async function autoasignarCuentasContables(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;

  await prisma.configuracionNomina.upsert({
    where: { companyId },
    create: { companyId, ...PLANTILLA_CUENTAS_CONTABLES },
    update: { ...PLANTILLA_CUENTAS_CONTABLES },
  });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

// ── 2.4 — Conceptos y bonos ──────────────────────────────────────────────
export async function crearConcepto(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const nombre = (formData.get("nombre") as string)?.trim();
  const moneda = formData.get("moneda") as string;
  if (!nombre || !MONEDAS_VALIDAS.includes(moneda)) return;

  await prisma.conceptoNomina.create({
    data: {
      companyId,
      nombre,
      moneda,
      formulaAyuda: (formData.get("formulaAyuda") as string)?.trim() || null,
    },
  });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

export async function actualizarConcepto(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const c = await prisma.conceptoNomina.findUnique({ where: { id }, select: { companyId: true } });
  if (!c || c.companyId !== companyId) return;

  const nombre = (formData.get("nombre") as string)?.trim();
  const moneda = formData.get("moneda") as string;
  if (!nombre || !MONEDAS_VALIDAS.includes(moneda)) return;

  await prisma.conceptoNomina.update({
    where: { id },
    data: {
      nombre,
      moneda,
      formulaAyuda: (formData.get("formulaAyuda") as string)?.trim() || null,
      activo: formData.get("activo") === "on",
    },
  });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

// Los estándar (isSystem) no se eliminan — solo se desactivan editando.
export async function eliminarConcepto(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session || !canDelete(session.role)) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const c = await prisma.conceptoNomina.findUnique({ where: { id }, select: { companyId: true, isSystem: true } });
  if (!c || c.companyId !== companyId || c.isSystem) return;

  await prisma.conceptoNomina.delete({ where: { id } });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

// ── 2.4 — Compensación USD ────────────────────────────────────────────────
export async function guardarCompensacionUsd(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;

  const objetivoRaw = formData.get("compensacionUsdObjetivo") as string;
  const datos = {
    compensacionUsdActiva: formData.get("compensacionUsdActiva") === "on",
    compensacionUsdObjetivo: objetivoRaw ? Math.max(0, Number(objetivoRaw)) : null,
  };
  await prisma.configuracionNomina.upsert({
    where: { companyId },
    create: { companyId, ...datos },
    update: datos,
  });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

// ── 2.4 — Beneficios y políticas ─────────────────────────────────────────
export async function guardarBeneficios(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;

  const num = (name: string) => {
    const raw = formData.get(name) as string;
    return raw ? Math.max(0, Number(raw)) : null;
  };
  const tipoDistribucion = formData.get("utilidadesTipoDistribucion") as string;

  const datos = {
    utilidadesDiasAnio: num("utilidadesDiasAnio"),
    utilidadesDiasMin: num("utilidadesDiasMin"),
    utilidadesDiasMax: num("utilidadesDiasMax"),
    utilidadesTipoDistribucion: (TIPOS_DISTRIBUCION_UTILIDADES as readonly string[]).includes(tipoDistribucion)
      ? tipoDistribucion
      : "pago_unico_diciembre",
    vacacionesDiasExtra: num("vacacionesDiasExtra"),
    vacacionesBonoDiasExtra: num("vacacionesBonoDiasExtra"),
    vacacionesColectivas: formData.get("vacacionesColectivas") === "on",
    cestaticketObjetivoUsd: num("cestaticketObjetivoUsd"),
    anticiposPrestamosActivo: formData.get("anticiposPrestamosActivo") === "on",
    anticiposPrestamosNotas: (formData.get("anticiposPrestamosNotas") as string)?.trim() || null,
  };
  await prisma.configuracionNomina.upsert({
    where: { companyId },
    create: { companyId, ...datos },
    update: datos,
  });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

// ── 2.4 — Parámetros legales ─────────────────────────────────────────────
export async function guardarParametrosLegales(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;

  const num = (name: string) => {
    const raw = formData.get(name) as string;
    return raw ? Math.max(0, Number(raw)) : null;
  };
  const datos = {
    parametrosPersonalizados: formData.get("parametrosPersonalizados") === "on",
    salarioMinimoOverride: num("salarioMinimoOverride"),
    bonoGuerraOverride: num("bonoGuerraOverride"),
    cestaticketMensualOverride: num("cestaticketMensualOverride"),
    valorUTOverride: num("valorUTOverride"),
    jornadaSemanalHorasOverride: num("jornadaSemanalHorasOverride"),
  };
  await prisma.configuracionNomina.upsert({
    where: { companyId },
    create: { companyId, ...datos },
    update: datos,
  });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

export async function crearAporte(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const nombre = (formData.get("nombre") as string)?.trim();
  const tipo = formData.get("tipo") as string;
  const porcentaje = Number(formData.get("porcentaje"));
  if (!nombre || !(TIPOS_APORTE as readonly string[]).includes(tipo) || !Number.isFinite(porcentaje) || porcentaje < 0) return;

  await prisma.aporteLegal.create({ data: { companyId, nombre, tipo, porcentaje } });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

export async function actualizarAporte(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const a = await prisma.aporteLegal.findUnique({ where: { id }, select: { companyId: true } });
  if (!a || a.companyId !== companyId) return;

  const nombre = (formData.get("nombre") as string)?.trim();
  const porcentaje = Number(formData.get("porcentaje"));
  if (!nombre || !Number.isFinite(porcentaje) || porcentaje < 0) return;

  await prisma.aporteLegal.update({
    where: { id },
    data: { nombre, porcentaje, activo: formData.get("activo") === "on" },
  });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

export async function eliminarAporte(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session || !canDelete(session.role)) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const a = await prisma.aporteLegal.findUnique({ where: { id }, select: { companyId: true, isSystem: true } });
  if (!a || a.companyId !== companyId || a.isSystem) return;

  await prisma.aporteLegal.delete({ where: { id } });
  revalidatePath(`/nomina/${companyId}/configuracion`);
}

// Siembra el catálogo estándar de conceptos y aportes la primera vez que el
// cliente abre estas secciones — idempotente sobre el unique [companyId,
// clave]. SQLite no soporta `skipDuplicates` en createMany (solo Postgres),
// así que se crea uno por uno ignorando el choque de unicidad (mismo patrón
// que crearTrabajador). Llamada desde la página, no es una acción de formulario.
export async function asegurarCatalogosNomina(companyId: string) {
  if (!companyId) return;
  await Promise.all([
    ...CONCEPTOS_ESTANDAR.map((c) =>
      prisma.conceptoNomina.create({ data: { companyId, isSystem: true, ...c } }).catch((e) => {
        if (!esDuplicado(e)) throw e;
      })
    ),
    ...APORTES_ESTANDAR.map((a) =>
      prisma.aporteLegal.create({ data: { companyId, isSystem: true, ...a } }).catch((e) => {
        if (!esDuplicado(e)) throw e;
      })
    ),
  ]);
}
