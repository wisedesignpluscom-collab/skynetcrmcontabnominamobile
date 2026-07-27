"use server";

// Plan de servicios y servicios individuales del cliente (F3).
// Todo cuelga de la ficha del cliente: quien puede ver el cliente puede
// gestionar su plan; borrar sigue siendo potestad de gerencia/supervisión.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { canAccessCompany } from "@/lib/ownership";
import { esEstadoPlan, esEstadoServicio, servicioFacturable } from "@/lib/planes";
import { fechaLocal } from "@/lib/fiscal/vencimientos";
import { facturarServicioEntregado } from "@/lib/fiscal/facturacion";
import { emitEventAndProcess } from "@/lib/engine/queue";
import { revalidatePath } from "next/cache";

// Devuelve la sesión solo si puede tocar este cliente; si no, null.
async function sesionConAcceso(companyId: string) {
  const session = await getSession();
  if (!session || !companyId) return null;
  return (await canAccessCompany(session, companyId)) ? session : null;
}

// "aaaa-mm-dd" del <input type="date"> → mediodía local (convención del sistema)
function fechaDeFormulario(raw: string | null | undefined): Date | null {
  const texto = raw?.trim();
  if (!texto) return null;
  const [anio, mes, dia] = texto.split("-").map(Number);
  return anio && mes && dia ? fechaLocal(anio, mes, dia) : null;
}

function monto(formData: FormData, campo: string): number {
  const n = Number(formData.get(campo));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ── Plan de servicios ───────────────────────────────────────────────────────

export async function guardarPlan(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;

  const estado = (formData.get("estado") as string) || "activo";
  const datos = {
    honorarioMensual: monto(formData, "honorarioMensual"),
    moneda: (formData.get("moneda") as string) === "Bs" ? "Bs" : "USD",
    fechaInicio: fechaDeFormulario(formData.get("fechaInicio") as string),
    estado: esEstadoPlan(estado) ? estado : "activo",
    notas: (formData.get("notas") as string)?.trim() || null,
  };

  // Uno por cliente: el upsert evita que dos guardados seguidos creen dos planes.
  await prisma.planServicio.upsert({
    where: { companyId },
    update: datos,
    create: { companyId, ...datos },
  });
  revalidatePath(`/empresas/${companyId}`);
}

export async function cambiarEstadoPlan(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const estado = formData.get("estado") as string;
  if (!esEstadoPlan(estado)) return;
  await prisma.planServicio.update({ where: { companyId }, data: { estado } });
  revalidatePath(`/empresas/${companyId}`);
}

export async function agregarObligacionAlPlan(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const planId = formData.get("planId") as string;
  const obligacionId = formData.get("obligacionId") as string;
  if (!planId || !obligacionId) return;

  const dia = Number(formData.get("diaLimiteOverride"));
  await prisma.planObligacion.upsert({
    where: { planId_obligacionId: { planId, obligacionId } },
    update: {},
    create: {
      planId,
      obligacionId,
      diaLimiteOverride: dia >= 1 && dia <= 31 ? Math.trunc(dia) : null,
    },
  });
  revalidatePath(`/empresas/${companyId}`);
}

export async function actualizarObligacionDelPlan(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const dia = Number(formData.get("diaLimiteOverride"));
  await prisma.planObligacion.update({
    where: { id },
    data: { diaLimiteOverride: dia >= 1 && dia <= 31 ? Math.trunc(dia) : null },
  });
  revalidatePath(`/empresas/${companyId}`);
}

export async function quitarObligacionDelPlan(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.planObligacion.delete({ where: { id } });
  revalidatePath(`/empresas/${companyId}`);
}

// ── Servicios individuales ──────────────────────────────────────────────────

export async function crearServicio(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const tipo = (formData.get("tipo") as string)?.trim();
  if (!tipo) return;

  await prisma.servicioIndividual.create({
    data: {
      companyId,
      tipo,
      descripcion: (formData.get("descripcion") as string)?.trim() || null,
      montoCotizado: monto(formData, "montoCotizado"),
      moneda: (formData.get("moneda") as string) === "Bs" ? "Bs" : "USD",
      responsableId: (formData.get("responsableId") as string) || null,
      fechaEntrega: fechaDeFormulario(formData.get("fechaEntrega") as string),
    },
  });
  revalidatePath(`/empresas/${companyId}`);
}

export async function actualizarServicio(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConAcceso(companyId))) return;
  const id = formData.get("id") as string;
  const tipo = (formData.get("tipo") as string)?.trim();
  if (!id || !tipo) return;

  await prisma.servicioIndividual.update({
    where: { id },
    data: {
      tipo,
      descripcion: (formData.get("descripcion") as string)?.trim() || null,
      montoCotizado: monto(formData, "montoCotizado"),
      moneda: (formData.get("moneda") as string) === "Bs" ? "Bs" : "USD",
      responsableId: (formData.get("responsableId") as string) || null,
      fechaEntrega: fechaDeFormulario(formData.get("fechaEntrega") as string),
    },
  });
  revalidatePath(`/empresas/${companyId}`);
}

// Avanza (o retrocede) el servicio en su flujo. El estado destino viaja en el
// formulario: el botón de la UI ya sabe cuál es el siguiente paso.
export async function cambiarEstadoServicio(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  if (!session) return;
  const id = formData.get("id") as string;
  const estado = formData.get("estado") as string;
  if (!id || !esEstadoServicio(estado)) return;
  await prisma.servicioIndividual.update({ where: { id }, data: { estado } });

  // Entregado = cobrable: la factura la emite el sistema (F6), no una regla, y
  // el índice único impide cobrarlo dos veces si el estado va y viene.
  if (servicioFacturable(estado)) {
    const factura = await facturarServicioEntregado(id);
    if (factura) {
      await emitEventAndProcess({
        type: "factura.emitida",
        entity: "facturacion",
        entityId: factura.id,
        record: factura.record,
        user: session,
      });
    }
  }

  revalidatePath(`/empresas/${companyId}`);
  revalidatePath("/facturacion");
}

export async function eliminarServicio(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConAcceso(companyId);
  // Borrar es potestad de gerencia y supervisión, como en el resto del CRM
  if (!session || !canDelete(session.role)) return;
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.servicioIndividual.delete({ where: { id } });
  revalidatePath(`/empresas/${companyId}`);
}
