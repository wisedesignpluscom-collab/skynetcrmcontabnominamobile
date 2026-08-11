"use server";

// Apertura de empresa (Etapa 3.6 «Mis Consultores»): trámite de UNA SOLA VEZ
// para constituir un cliente nuevo (SAREN → RIF → registros patronales),
// separado de los casos recurrentes — reutiliza la misma maquinaria de
// CasoRecurrente/CasoFase que el resto de la Etapa 3 (abrirCaso).

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canAccessCompany } from "@/lib/ownership";
import { abrirCaso } from "@/lib/fiscal/casos";
import { revalidatePath } from "next/cache";

const NOMBRE_OBLIGACION_APERTURA = "Apertura de empresa (SAREN)";
// Un solo período posible por cliente: el índice único
// [companyId, obligacionId, periodoFiscal] impide abrir dos veces.
const PERIODO_APERTURA = "unico";

export async function iniciarAperturaEmpresa(formData: FormData) {
  const session = await getSession();
  const companyId = formData.get("companyId") as string;
  if (!session || !companyId) return;
  if (!(await canAccessCompany(session, companyId))) return;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { rif: true, analistaId: true, supervisorId: true },
  });
  // Solo tiene sentido antes de que el cliente tenga RIF — una vez que lo
  // tiene, ya está constituido.
  if (!company || company.rif) return;

  const obligacion = await prisma.obligacion.findFirst({ where: { nombre: NOMBRE_OBLIGACION_APERTURA } });
  if (!obligacion) return;

  await abrirCaso({
    companyId,
    obligacionId: obligacion.id,
    periodoFiscal: PERIODO_APERTURA,
    fechaLimite: null,
    analistaId: company.analistaId,
    supervisorId: company.supervisorId,
  });
  revalidatePath(`/empresas/${companyId}`);
}

// Paso explícito y simple (no una regla del Builder, CLAUDE.md §18): el
// analista confirma que la empresa quedó constituida y el cliente avanza de
// "lead" a "prospecto". Solo tiene efecto si el caso de apertura ya está
// presentado — no se puede saltar el checklist.
export async function confirmarConstitucion(formData: FormData) {
  const session = await getSession();
  const companyId = formData.get("companyId") as string;
  if (!session || !companyId) return;
  if (!(await canAccessCompany(session, companyId))) return;

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { estadoCliente: true } });
  if (!company || company.estadoCliente !== "lead") return;

  const obligacion = await prisma.obligacion.findFirst({ where: { nombre: NOMBRE_OBLIGACION_APERTURA } });
  if (!obligacion) return;
  const caso = await prisma.casoRecurrente.findUnique({
    where: { companyId_obligacionId_periodoFiscal: { companyId, obligacionId: obligacion.id, periodoFiscal: PERIODO_APERTURA } },
    select: { estado: true },
  });
  if (caso?.estado !== "presentado") return;

  await prisma.company.update({ where: { id: companyId }, data: { estadoCliente: "prospecto" } });
  revalidatePath(`/empresas/${companyId}`);
}
