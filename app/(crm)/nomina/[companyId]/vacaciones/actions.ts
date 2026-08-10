"use server";

// Vacaciones (2.6) — mismo patrón de acceso que el resto de nómina: quien
// puede ver el cliente gestiona las vacaciones de su roster.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { canAccessCompany } from "@/lib/ownership";
import { aniosServicioCompletos, diasVacacionesLegal, ESTADOS_VACACIONES } from "@/lib/lottt";
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

export async function programarVacaciones(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const trabajadorId = formData.get("trabajadorId") as string;
  const fechaCorte = fechaDeFormulario(formData.get("fechaCorte") as string);
  if (!trabajadorId || !fechaCorte) return;

  const trabajador = await prisma.trabajador.findUnique({ where: { id: trabajadorId } });
  if (!trabajador || trabajador.companyId !== companyId) return;
  const config = await prisma.configuracionNomina.findUnique({ where: { companyId } });

  const anioServicio = trabajador.fechaIngreso ? aniosServicioCompletos(trabajador.fechaIngreso, fechaCorte) : 0;
  const diasSugeridos = diasVacacionesLegal(anioServicio) + (config?.vacacionesDiasExtra ?? 0);
  const diasOverride = formData.get("diasCorrespondientes") as string;
  const diasCorrespondientes = diasOverride ? Number(diasOverride) : diasSugeridos;

  try {
    await prisma.registroVacaciones.create({
      data: {
        trabajadorId,
        anioServicio,
        fechaCorte,
        diasCorrespondientes,
        fechaInicio: fechaDeFormulario(formData.get("fechaInicio") as string),
        fechaFin: fechaDeFormulario(formData.get("fechaFin") as string),
        notas: (formData.get("notas") as string)?.trim() || null,
      },
    });
  } catch (e) {
    if (typeof e !== "object" || e === null || (e as { code?: string }).code !== "P2002") throw e;
  }
  revalidatePath(`/nomina/${companyId}/vacaciones`);
}

export async function actualizarVacaciones(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const registro = await prisma.registroVacaciones.findUnique({ where: { id }, include: { trabajador: true } });
  if (!registro || registro.trabajador.companyId !== companyId) return;

  const estado = formData.get("estado") as string;
  await prisma.registroVacaciones.update({
    where: { id },
    data: {
      diasCorrespondientes: Number(formData.get("diasCorrespondientes")) || 0,
      diasTomados: Number(formData.get("diasTomados")) || 0,
      fechaInicio: fechaDeFormulario(formData.get("fechaInicio") as string),
      fechaFin: fechaDeFormulario(formData.get("fechaFin") as string),
      estado: (ESTADOS_VACACIONES as readonly string[]).includes(estado) ? estado : registro.estado,
      notas: (formData.get("notas") as string)?.trim() || null,
    },
  });
  revalidatePath(`/nomina/${companyId}/vacaciones`);
}

export async function eliminarVacaciones(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session || !canDelete(session.role)) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const registro = await prisma.registroVacaciones.findUnique({ where: { id }, include: { trabajador: true } });
  if (!registro || registro.trabajador.companyId !== companyId) return;

  await prisma.registroVacaciones.delete({ where: { id } });
  revalidatePath(`/nomina/${companyId}/vacaciones`);
}
