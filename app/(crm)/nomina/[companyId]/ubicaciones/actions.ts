"use server";

// Ubicaciones / geocercas (2.7) — mismo patrón de acceso que el resto de
// nómina. Concepto genérico (nombre + coordenadas + radio + jornada
// opcional), sin captura de referencia todavía — se ajusta cuando se vea el
// original o se defina con el cliente.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { canAccessCompany } from "@/lib/ownership";
import { revalidatePath } from "next/cache";

async function sesionConAcceso(companyId: string) {
  const session = await getSession();
  if (!session || !companyId) return null;
  return (await canAccessCompany(session, companyId)) ? session : null;
}

function datosGeocerca(formData: FormData) {
  const jornadaId = (formData.get("jornadaId") as string) || null;
  return {
    nombre: (formData.get("nombre") as string)?.trim(),
    latitud: Number(formData.get("latitud")),
    longitud: Number(formData.get("longitud")),
    radioMetros: Math.max(1, Number(formData.get("radioMetros")) || 100),
    jornadaId,
  };
}

export async function crearGeocerca(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const datos = datosGeocerca(formData);
  if (!datos.nombre || !Number.isFinite(datos.latitud) || !Number.isFinite(datos.longitud)) return;
  if (datos.jornadaId) {
    const j = await prisma.jornada.findUnique({ where: { id: datos.jornadaId }, select: { companyId: true } });
    if (!j || j.companyId !== companyId) datos.jornadaId = null;
  }

  await prisma.geocerca.create({ data: { companyId, ...datos } });
  revalidatePath(`/nomina/${companyId}/ubicaciones`);
}

export async function actualizarGeocerca(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const g = await prisma.geocerca.findUnique({ where: { id }, select: { companyId: true } });
  if (!g || g.companyId !== companyId) return;

  const datos = datosGeocerca(formData);
  if (!datos.nombre || !Number.isFinite(datos.latitud) || !Number.isFinite(datos.longitud)) return;
  if (datos.jornadaId) {
    const j = await prisma.jornada.findUnique({ where: { id: datos.jornadaId }, select: { companyId: true } });
    if (!j || j.companyId !== companyId) datos.jornadaId = null;
  }

  await prisma.geocerca.update({
    where: { id },
    data: { ...datos, activa: formData.get("activa") === "on" },
  });
  revalidatePath(`/nomina/${companyId}/ubicaciones`);
}

export async function eliminarGeocerca(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session || !canDelete(session.role)) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const g = await prisma.geocerca.findUnique({ where: { id }, select: { companyId: true } });
  if (!g || g.companyId !== companyId) return;

  await prisma.geocerca.delete({ where: { id } });
  revalidatePath(`/nomina/${companyId}/ubicaciones`);
}
