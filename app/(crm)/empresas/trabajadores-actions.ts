"use server";

// Roster de trabajadores del cliente contable (Mis Consultores). Cuelga de la
// ficha del cliente, mismo patrón que plan-actions.ts: quien puede ver el
// cliente gestiona su roster; borrar sigue siendo potestad de gerencia y
// supervisión. La base salarial declarada por período (DeclaracionNomina) y
// sus heurísticas de riesgo llegan en el siguiente incremento.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { canAccessCompany } from "@/lib/ownership";
import { normalizeCedula, isCedulaValida } from "@/lib/cedula";
import { esTipoContrato } from "@/lib/trabajadores";
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

function esDuplicado(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export async function crearTrabajador(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;

  const cedula = normalizeCedula(formData.get("cedula") as string);
  const nombre = (formData.get("nombre") as string)?.trim();
  if (!cedula || !isCedulaValida(cedula) || !nombre) return;

  try {
    const trabajador = await prisma.trabajador.create({
      data: {
        companyId,
        cedula,
        nombre,
        cargo: (formData.get("cargo") as string)?.trim() || null,
        fechaIngreso: fechaDeFormulario(formData.get("fechaIngreso") as string),
      },
    });
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: "Alta del empleado en el roster",
        trabajadorId: trabajador.id,
      },
    });
  } catch (e) {
    // Cédula duplicada en la misma empresa: se ignora, no rompe la carga
    if (!esDuplicado(e)) throw e;
  }
  revalidatePath(`/empresas/${companyId}`);
  revalidatePath(`/nomina/${companyId}/empleados`);
}

export async function actualizarTrabajador(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  if (!id || !nombre) return;

  const cedulaRaw = normalizeCedula(formData.get("cedula") as string);
  if (!cedulaRaw || !isCedulaValida(cedulaRaw)) return;

  const tipoContratoRaw = (formData.get("tipoContrato") as string) || null;
  const objetivoUsdRaw = formData.get("objetivoUsd") as string;

  try {
    await prisma.trabajador.update({
      where: { id },
      data: {
        cedula: cedulaRaw,
        nombre,
        cargo: (formData.get("cargo") as string)?.trim() || null,
        tipoContrato: tipoContratoRaw && esTipoContrato(tipoContratoRaw) ? tipoContratoRaw : null,
        fechaIngreso: fechaDeFormulario(formData.get("fechaIngreso") as string),
        fechaEgreso: fechaDeFormulario(formData.get("fechaEgreso") as string),
        objetivoUsd: objetivoUsdRaw ? Math.max(0, Number(objetivoUsdRaw)) : null,
      },
    });
  } catch (e) {
    if (!esDuplicado(e)) throw e;
  }
  revalidatePath(`/empresas/${companyId}`);
  revalidatePath(`/nomina/${companyId}/empleados`);
}

// Activo/inactivo (egreso) — un clic, sin abrir el formulario de edición
export async function alternarActivoTrabajador(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const t = await prisma.trabajador.findUnique({ where: { id }, select: { activo: true, companyId: true } });
  if (!t || t.companyId !== companyId) return;
  await prisma.trabajador.update({ where: { id }, data: { activo: !t.activo } });
  revalidatePath(`/empresas/${companyId}`);
}

// Baja lógica (2.2: botón "Deshabilitar" de la ficha) — nunca se elimina el
// registro, se conserva historial. Distinta de alternarActivoTrabajador: acá
// se exige motivo y queda auditado en el ciclo de vida.
export async function deshabilitarTrabajador(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  const motivo = (formData.get("motivo") as string)?.trim() || null;
  if (!id) return;
  const t = await prisma.trabajador.findUnique({ where: { id }, select: { companyId: true } });
  if (!t || t.companyId !== companyId) return;

  await prisma.trabajador.update({
    where: { id },
    data: { activo: false, motivoBaja: motivo, fechaEgreso: new Date() },
  });
  await prisma.activity.create({
    data: {
      type: "sistema",
      content: motivo ? `Baja del empleado: ${motivo}` : "Baja del empleado",
      trabajadorId: id,
    },
  });
  revalidatePath(`/empresas/${companyId}`);
  revalidatePath(`/nomina/${companyId}/empleados`);
}

export async function reactivarTrabajador(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const t = await prisma.trabajador.findUnique({ where: { id }, select: { companyId: true } });
  if (!t || t.companyId !== companyId) return;

  await prisma.trabajador.update({
    where: { id },
    data: { activo: true, motivoBaja: null, fechaEgreso: null },
  });
  await prisma.activity.create({
    data: { type: "sistema", content: "Reactivación del empleado", trabajadorId: id },
  });
  revalidatePath(`/empresas/${companyId}`);
  revalidatePath(`/nomina/${companyId}/empleados`);
}

// ── Documentos (tab "Documentos" de la ficha) ───────────────────────────────
export async function agregarDocumentoTrabajador(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const trabajadorId = formData.get("trabajadorId") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  const url = (formData.get("url") as string)?.trim();
  if (!trabajadorId || !nombre || !url) return;
  const t = await prisma.trabajador.findUnique({ where: { id: trabajadorId }, select: { companyId: true } });
  if (!t || t.companyId !== companyId) return;

  await prisma.trabajadorDocumento.create({ data: { trabajadorId, nombre, url } });
  revalidatePath(`/nomina/${companyId}/empleados`);
}

export async function eliminarDocumentoTrabajador(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const doc = await prisma.trabajadorDocumento.findUnique({
    where: { id },
    select: { trabajador: { select: { companyId: true } } },
  });
  if (!doc || doc.trabajador.companyId !== companyId) return;

  await prisma.trabajadorDocumento.delete({ where: { id } });
  revalidatePath(`/nomina/${companyId}/empleados`);
}

export async function eliminarTrabajador(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  // Borrar es potestad de gerencia y supervisión, como el resto del roster del cliente
  if (!session || !canDelete(session.role)) return;
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.trabajador.delete({ where: { id } });
  revalidatePath(`/empresas/${companyId}`);
}
