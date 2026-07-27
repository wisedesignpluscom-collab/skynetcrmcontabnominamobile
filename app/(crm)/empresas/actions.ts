"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete, canReassign } from "@/lib/permissions";
import { canAccessCompany } from "@/lib/ownership";
import { validateForm, formDataToRecord } from "@/lib/engine/validate";
import { emitEventAndProcess } from "@/lib/engine/queue";
import { multiFromFormData } from "@/lib/multivalor";
import { normalizeRif, isRifValido, MENSAJE_RIF_INVALIDO } from "@/lib/rif";
import { esEstadoCliente } from "@/lib/clientes";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Campos del cliente contable comunes a crear y editar. Los de asignación
// (analista/supervisor) se manejan aparte: solo los reasigna quien puede.
function datosCliente(formData: FormData) {
  const estado = (formData.get("estadoCliente") as string) || "lead";
  const fechaCierre = (formData.get("fechaCierre") as string)?.trim();
  return {
    industry: (formData.get("industry") as string)?.trim() || null,
    website: (formData.get("website") as string)?.trim() || null,
    phone: (formData.get("phone") as string)?.trim() || null,
    address: (formData.get("address") as string)?.trim() || null,
    city: (formData.get("city") as string)?.trim() || null,
    notes: (formData.get("notes") as string)?.trim() || null,
    rif: normalizeRif(formData.get("rif") as string),
    regimenTributario: (formData.get("regimenTributario") as string)?.trim() || null,
    municipios: multiFromFormData(formData, "municipios"),
    tamano: (formData.get("tamano") as string)?.trim() || null,
    moneda: (formData.get("moneda") as string) || "USD",
    estadoCliente: esEstadoCliente(estado) ? estado : "lead",
    // Mediodía local (misma convención que las tareas): así el día elegido no
    // se corre al anterior al mostrarlo en la zona horaria de Venezuela.
    fechaCierre: fechaCierre ? new Date(`${fechaCierre}T12:00:00`) : null,
    contadorAnterior: (formData.get("contadorAnterior") as string)?.trim() || null,
  };
}

// El RIF es único: un choque de unicidad de Prisma se traduce a un mensaje
// entendible en vez de reventar la acción.
function esRifDuplicado(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002" &&
    JSON.stringify((e as { meta?: unknown }).meta ?? "").includes("rif")
  );
}

async function validarCliente(
  formData: FormData,
  session: Awaited<ReturnType<typeof getSession>>
): Promise<string[]> {
  const errors: string[] = [];
  const rif = (formData.get("rif") as string)?.trim();
  // El formato del RIF se valida siempre (es la llave del cliente ante el SENIAT)
  if (rif && !isRifValido(rif)) errors.push(MENSAJE_RIF_INVALIDO);

  // Reglas configurables del Automation Engine (obligatorias, server-side)
  const validation = await validateForm("company", {
    record: formDataToRecord(formData),
    user: session,
  });
  if (!validation.ok) errors.push(...(validation.errors ?? []));
  return errors;
}

export async function createCompany(
  _prev: { errors?: string[] } | undefined,
  formData: FormData
): Promise<{ errors?: string[] } | undefined> {
  const session = await getSession();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { errors: ["La razón social es obligatoria."] };

  const errors = await validarCliente(formData, session);
  if (errors.length > 0) return { errors };

  let company;
  try {
    company = await prisma.company.create({
      data: {
        name,
        ...datosCliente(formData),
        analistaId: (formData.get("analistaId") as string) || null,
        supervisorId: (formData.get("supervisorId") as string) || null,
      },
    });
  } catch (e) {
    if (esRifDuplicado(e)) return { errors: ["Ya existe un cliente con ese RIF."] };
    throw e;
  }

  await emitEventAndProcess({
    type: "company.created",
    entity: "company",
    entityId: company.id,
    record: company,
    user: session,
  });

  revalidatePath("/empresas");
  redirect(`/empresas/${company.id}`);
}

export async function updateCompany(
  _prev: { errors?: string[] } | undefined,
  formData: FormData
): Promise<{ errors?: string[] } | undefined> {
  const session = await getSession();
  if (!session) return;
  const id = formData.get("companyId") as string;
  if (!id) return;
  // El analista no edita clientes ajenos (protección ante POST directo)
  if (!(await canAccessCompany(session, id))) return;

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { errors: ["La razón social es obligatoria."] };

  const errors = await validarCliente(formData, session);
  if (errors.length > 0) return { errors };

  // Reasignar la cuenta es potestad de gerencia y supervisión: si el analista
  // manipula el formulario, la asignación existente se conserva.
  const asignacion = canReassign(session.role)
    ? {
        analistaId: (formData.get("analistaId") as string) || null,
        supervisorId: (formData.get("supervisorId") as string) || null,
      }
    : {};

  let company;
  try {
    company = await prisma.company.update({
      where: { id },
      data: { name, ...datosCliente(formData), ...asignacion },
    });
  } catch (e) {
    if (esRifDuplicado(e)) return { errors: ["Ya existe un cliente con ese RIF."] };
    throw e;
  }

  await emitEventAndProcess({
    type: "company.updated",
    entity: "company",
    entityId: company.id,
    record: company,
    user: session,
  });

  revalidatePath("/empresas");
  revalidatePath(`/empresas/${id}`);
  redirect(`/empresas/${id}`);
}

export async function deleteCompany(formData: FormData) {
  const session = await getSession();
  if (!canDelete(session?.role)) return;

  const companyId = formData.get("companyId") as string;
  if (!companyId) return;

  const snapshot = await prisma.company.findUnique({ where: { id: companyId } });
  // Los contactos y oportunidades quedan sin empresa (no se borran)
  await prisma.company.delete({ where: { id: companyId } });

  if (snapshot) {
    await emitEventAndProcess({
      type: "company.deleted",
      entity: "company",
      entityId: companyId,
      record: snapshot,
      user: session,
    });
  }

  revalidatePath("/empresas");
  redirect("/empresas");
}
