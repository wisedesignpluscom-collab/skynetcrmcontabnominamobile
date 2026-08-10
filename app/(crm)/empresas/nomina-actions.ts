"use server";

// Base salarial declarada por trabajador y período (Rule Engine — validación
// FAO) y su ciclo de vida (Workflow Engine — estados + bloqueo supervisorio).
// Cuelga de la ficha del cliente, mismo gate que trabajadores-actions.ts: quien
// puede ver el cliente gestiona sus declaraciones; llegar a «aprobada» — lista
// para el archivo a Galac — exige gerencia/supervisión, como el resto de las
// aprobaciones del sistema.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canAccessCompany } from "@/lib/ownership";
import { canApprove } from "@/lib/permissions";
import {
  evaluarRiesgoAutomatico,
  salarioMinimoVigente,
  siguienteEstadoDeclaracion,
  ESTADO_BLOQUEADA,
  type MotivoRiesgo,
} from "@/lib/nomina";
import { getConfigRiesgoNomina } from "@/lib/nominaSettings";
import { parsePeriodo, fechaLocal } from "@/lib/fiscal/vencimientos";
import { parseMulti, serializeMulti, hasValue } from "@/lib/multivalor";
import { revalidatePath } from "next/cache";

async function sesionConAcceso(companyId: string) {
  const session = await getSession();
  if (!session || !companyId) return null;
  return (await canAccessCompany(session, companyId)) ? session : null;
}

// El trabajador debe pertenecer a la empresa del formulario — defensa contra
// un trabajadorId ajeno colado por POST directo.
async function trabajadorDeLaEmpresa(trabajadorId: string, companyId: string) {
  const t = await prisma.trabajador.findUnique({ where: { id: trabajadorId }, select: { companyId: true } });
  return !!t && t.companyId === companyId;
}

async function evaluarRiesgo(trabajadorId: string, periodo: string, baseDeclarada: number) {
  const p = parsePeriodo(periodo);
  const fechaRef = p ? fechaLocal(p.anio, p.mes, 1) : new Date();
  const [historialMinimo, anterior, config] = await Promise.all([
    prisma.salarioMinimo.findMany({ select: { vigenteDesde: true, monto: true } }),
    prisma.declaracionNomina.findFirst({
      where: { trabajadorId, periodo: { lt: periodo } },
      orderBy: { periodo: "desc" },
      select: { baseDeclarada: true },
    }),
    getConfigRiesgoNomina(),
  ]);
  return evaluarRiesgoAutomatico({
    baseDeclarada,
    salarioMinimo: salarioMinimoVigente(historialMinimo, fechaRef),
    baseAnterior: anterior?.baseDeclarada ?? null,
    config,
  });
}

export async function guardarDeclaracion(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session) return;
  const trabajadorId = formData.get("trabajadorId") as string;
  const periodo = (formData.get("periodo") as string)?.trim();
  const baseDeclarada = Number(formData.get("baseDeclarada"));
  if (
    !trabajadorId ||
    !periodo ||
    !parsePeriodo(periodo) ||
    !Number.isFinite(baseDeclarada) ||
    baseDeclarada < 0
  ) {
    return;
  }
  if (!(await trabajadorDeLaEmpresa(trabajadorId, companyId))) return;

  // La marca manual de riesgo no se pierde al re-declarar la base: solo las
  // dos heurísticas automáticas se recalculan desde cero cada vez. Si ya se
  // resolvió (riesgo=false, aunque motivoRiesgo todavía diga "manual" como
  // historial), no revive sola — necesita una marca nueva.
  const existente = await prisma.declaracionNomina.findUnique({
    where: { trabajadorId_periodo: { trabajadorId, periodo } },
    select: { baseDeclarada: true, estado: true, riesgo: true, motivoRiesgo: true, notaRiesgo: true },
  });
  const teniaManual = !!existente?.riesgo && hasValue(existente.motivoRiesgo, "manual");

  const auto = await evaluarRiesgo(trabajadorId, periodo, baseDeclarada);
  const motivos: MotivoRiesgo[] = teniaManual ? [...auto.motivos, "manual"] : auto.motivos;

  // Cambiar el número invalida cualquier revisión/aprobación previa: vuelve a
  // pendiente para que el flujo se recorra de nuevo con el valor correcto.
  const cambioBase = !!existente && existente.baseDeclarada !== baseDeclarada;

  await prisma.declaracionNomina.upsert({
    where: { trabajadorId_periodo: { trabajadorId, periodo } },
    update: {
      baseDeclarada,
      riesgo: motivos.length > 0,
      motivoRiesgo: serializeMulti(motivos),
      notaRiesgo: teniaManual ? existente!.notaRiesgo : null,
      ...(cambioBase ? { estado: "pendiente" } : {}),
    },
    create: {
      trabajadorId,
      periodo,
      baseDeclarada,
      riesgo: motivos.length > 0,
      motivoRiesgo: serializeMulti(motivos),
      // Quién cargó la declaración por primera vez — no se reescribe en ediciones
      createdById: session.id,
    },
  });
  revalidatePath(`/empresas/${companyId}`);
  revalidatePath("/riesgo-nomina");
}

// Marca manual: el analista o el supervisor detectan presión del cliente que
// ninguna heurística captura. Exige una nota — es la justificación que queda
// en el registro. Solo se puede marcar sobre una base ya declarada.
export async function marcarRiesgoManual(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session) return;
  const trabajadorId = formData.get("trabajadorId") as string;
  const periodo = (formData.get("periodo") as string)?.trim();
  const nota = (formData.get("notaRiesgo") as string)?.trim();
  if (!trabajadorId || !periodo || !parsePeriodo(periodo) || !nota) return;
  if (!(await trabajadorDeLaEmpresa(trabajadorId, companyId))) return;

  const existente = await prisma.declaracionNomina.findUnique({
    where: { trabajadorId_periodo: { trabajadorId, periodo } },
  });
  if (!existente) return;

  const motivos = parseMulti(existente.motivoRiesgo);
  if (!motivos.includes("manual")) motivos.push("manual");

  await prisma.declaracionNomina.update({
    where: { trabajadorId_periodo: { trabajadorId, periodo } },
    data: {
      riesgo: true,
      motivoRiesgo: serializeMulti(motivos),
      // Se acumula, no se pisa: si ya había una nota (ej. una resolución
      // previa en el mismo período), esa historia no se pierde.
      notaRiesgo: existente.notaRiesgo ? `${existente.notaRiesgo} · ${nota}` : nota,
      riesgoMarcadoPorId: session.id,
    },
  });
  revalidatePath(`/empresas/${companyId}`);
  revalidatePath("/riesgo-nomina");
}

// Avanza la declaración un paso. Si el siguiente paso sería «aprobada» y sigue
// en riesgo, el intento se desvía a «bloqueada» — el bloqueo lo pone el
// riesgo, no un rol; solo llegar a «aprobada» de verdad exige gerencia o
// supervisión, igual que el resto de las aprobaciones del sistema.
export async function avanzarEstadoDeclaracion(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session) return;
  const trabajadorId = formData.get("trabajadorId") as string;
  const periodo = (formData.get("periodo") as string)?.trim();
  if (!trabajadorId || !periodo || !parsePeriodo(periodo)) return;
  if (!(await trabajadorDeLaEmpresa(trabajadorId, companyId))) return;

  const existente = await prisma.declaracionNomina.findUnique({
    where: { trabajadorId_periodo: { trabajadorId, periodo } },
    select: { estado: true, riesgo: true },
  });
  if (!existente) return;

  const siguiente = siguienteEstadoDeclaracion(existente.estado);
  if (!siguiente) return;

  if (siguiente === "aprobada") {
    if (existente.riesgo) {
      await prisma.declaracionNomina.update({
        where: { trabajadorId_periodo: { trabajadorId, periodo } },
        data: { estado: ESTADO_BLOQUEADA },
      });
      revalidatePath(`/empresas/${companyId}`);
      revalidatePath("/riesgo-nomina");
      return;
    }
    if (!canApprove(session.role)) return; // aprobar es potestad de gerencia/supervisión
    await prisma.declaracionNomina.update({
      where: { trabajadorId_periodo: { trabajadorId, periodo } },
      data: { estado: "aprobada", aprobadaPorId: session.id },
    });
    revalidatePath(`/empresas/${companyId}`);
    revalidatePath("/riesgo-nomina");
    return;
  }

  await prisma.declaracionNomina.update({
    where: { trabajadorId_periodo: { trabajadorId, periodo } },
    data: { estado: siguiente },
  });
  revalidatePath(`/empresas/${companyId}`);
  revalidatePath("/riesgo-nomina");
}

// Resuelve un bloqueo por riesgo: gerencia/supervisión revisa el caso, deja su
// nota y la declaración vuelve a en_revision (no al pendiente original: ya se
// declaró y ya se miró, solo faltaba el visto bueno). El riesgo NO se limpia
// — es el historial de que la declaración estuvo señalada — solo se destraba
// el flujo.
export async function resolverBloqueo(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session || !canApprove(session.role)) return;
  const trabajadorId = formData.get("trabajadorId") as string;
  const periodo = (formData.get("periodo") as string)?.trim();
  const notaResolucion = (formData.get("notaResolucion") as string)?.trim();
  if (!trabajadorId || !periodo || !parsePeriodo(periodo) || !notaResolucion) return;
  if (!(await trabajadorDeLaEmpresa(trabajadorId, companyId))) return;

  const existente = await prisma.declaracionNomina.findUnique({
    where: { trabajadorId_periodo: { trabajadorId, periodo } },
    select: { estado: true, notaRiesgo: true },
  });
  if (!existente || existente.estado !== ESTADO_BLOQUEADA) return;

  await prisma.declaracionNomina.update({
    where: { trabajadorId_periodo: { trabajadorId, periodo } },
    data: {
      estado: "en_revision",
      // La bandera activa se apaga — gerencia ya la revisó y decidió dejarla
      // pasar; motivoRiesgo y la nota quedan intactos como historial de que
      // estuvo señalada. Sin esto, avanzar volvería a rebotar a bloqueada.
      riesgo: false,
      notaRiesgo: existente.notaRiesgo
        ? `${existente.notaRiesgo} · Resolución: ${notaResolucion}`
        : `Resolución: ${notaResolucion}`,
      resueltoPorId: session.id,
    },
  });
  revalidatePath(`/empresas/${companyId}`);
  revalidatePath("/riesgo-nomina");
}
