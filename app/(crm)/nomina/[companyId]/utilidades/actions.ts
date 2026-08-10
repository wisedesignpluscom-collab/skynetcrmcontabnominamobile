"use server";

// Utilidades (2.6) — mismo patrón de acceso que el resto de nómina.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { canAccessCompany } from "@/lib/ownership";
import { mesesTrabajadosEnAnio, diasUtilidadesProporcional, salarioDiario, ESTADOS_UTILIDADES } from "@/lib/lottt";
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

// Genera (o recalcula) el borrador de utilidades del año para todos los
// trabajadores activos. Usa la última base declarada del año como salario
// de referencia (simplificación — no promedia las 12 declaraciones
// mensuales; ver la nota en la pantalla).
export async function generarBorradorUtilidades(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const anio = Number(formData.get("anio"));
  if (!Number.isInteger(anio)) return;

  const [config, trabajadores] = await Promise.all([
    prisma.configuracionNomina.findUnique({ where: { companyId } }),
    prisma.trabajador.findMany({ where: { companyId, activo: true } }),
  ]);
  const diasAnioConfigurados = config?.utilidadesDiasAnio ?? 30;
  // El año en curso todavía no terminó: un empleado activo (sin fecha de
  // egreso) no ha trabajado los 12 meses todavía, solo hasta hoy.
  const hoy = new Date();
  const anioEnCurso = anio === hoy.getFullYear();

  for (const t of trabajadores) {
    const fechaEgresoEfectiva = t.fechaEgreso ?? (anioEnCurso ? hoy : null);
    const meses = mesesTrabajadosEnAnio(t.fechaIngreso, fechaEgresoEfectiva, anio);
    if (meses <= 0) continue;

    const declaraciones = await prisma.declaracionNomina.findMany({
      where: { trabajadorId: t.id, periodo: { startsWith: `${anio}-` } },
      orderBy: { periodo: "desc" },
      take: 1,
    });
    const baseMensual = declaraciones[0]?.baseDeclarada ?? 0;
    const diasCalculados = diasUtilidadesProporcional(diasAnioConfigurados, meses);
    const montoCalculado = diasCalculados * salarioDiario(baseMensual);

    await prisma.registroUtilidades.upsert({
      where: { trabajadorId_anio: { trabajadorId: t.id, anio } },
      create: { trabajadorId: t.id, anio, diasCalculados, montoCalculado },
      update: { diasCalculados, montoCalculado },
    });
  }
  revalidatePath(`/nomina/${companyId}/utilidades`);
}

export async function actualizarUtilidades(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const registro = await prisma.registroUtilidades.findUnique({ where: { id }, include: { trabajador: true } });
  if (!registro || registro.trabajador.companyId !== companyId) return;

  const estado = formData.get("estado") as string;
  await prisma.registroUtilidades.update({
    where: { id },
    data: {
      diasCalculados: Number(formData.get("diasCalculados")) || 0,
      montoCalculado: Number(formData.get("montoCalculado")) || 0,
      montoPagado: Number(formData.get("montoPagado")) || 0,
      estado: (ESTADOS_UTILIDADES as readonly string[]).includes(estado) ? estado : registro.estado,
      fechaPago: fechaDeFormulario(formData.get("fechaPago") as string),
      notas: (formData.get("notas") as string)?.trim() || null,
    },
  });
  revalidatePath(`/nomina/${companyId}/utilidades`);
}

export async function eliminarUtilidades(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session || !canDelete(session.role)) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const registro = await prisma.registroUtilidades.findUnique({ where: { id }, include: { trabajador: true } });
  if (!registro || registro.trabajador.companyId !== companyId) return;

  await prisma.registroUtilidades.delete({ where: { id } });
  revalidatePath(`/nomina/${companyId}/utilidades`);
}
