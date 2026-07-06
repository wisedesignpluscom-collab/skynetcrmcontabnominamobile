"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete, canReassign } from "@/lib/permissions";
import { validateForm, formDataToRecord } from "@/lib/engine/validate";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createContact(
  _prev: { errors?: string[] } | undefined,
  formData: FormData
): Promise<{ errors?: string[] } | undefined> {
  const session = await getSession();
  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  if (!firstName || !lastName) return { errors: ["Nombre y apellido son obligatorios."] };

  // Validación del Automation Engine (obligatoria, server-side)
  const validation = await validateForm("contact", {
    record: formDataToRecord(formData),
    user: session,
  });
  if (!validation.ok) return { errors: validation.errors };

  const companyId = (formData.get("companyId") as string) || null;

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: (formData.get("email") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      position: (formData.get("position") as string)?.trim() || null,
      source: (formData.get("source") as string) || null,
      status: (formData.get("status") as string) || "lead",
      notes: (formData.get("notes") as string)?.trim() || null,
      companyId,
      ownerId: session?.id ?? null,
    },
  });

  await prisma.activity.create({
    data: {
      type: "sistema",
      content: `Contacto creado: ${firstName} ${lastName}`,
      contactId: contact.id,
    },
  });

  revalidatePath("/contactos");
  redirect(`/contactos/${contact.id}`);
}

export async function addActivity(formData: FormData) {
  const contactId = formData.get("contactId") as string;
  const content = (formData.get("content") as string)?.trim();
  if (!contactId || !content) return;

  await prisma.activity.create({
    data: {
      type: (formData.get("type") as string) || "nota",
      content,
      contactId,
    },
  });

  revalidatePath(`/contactos/${contactId}`);
}

export async function reassignContact(formData: FormData) {
  const session = await getSession();
  if (!canReassign(session?.role)) return;

  const contactId = formData.get("contactId") as string;
  const ownerId = (formData.get("ownerId") as string) || null;
  if (!contactId) return;

  const [contact, newOwner] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId } }),
    ownerId ? prisma.user.findUnique({ where: { id: ownerId } }) : null,
  ]);
  if (!contact) return;

  await prisma.contact.update({ where: { id: contactId }, data: { ownerId } });
  // Las oportunidades abiertas del contacto pasan al mismo vendedor
  await prisma.deal.updateMany({
    where: { contactId, status: "open" },
    data: { ownerId },
  });

  await prisma.activity.create({
    data: {
      type: "sistema",
      content: `Cartera reasignada a ${newOwner?.name ?? "sin vendedor"} por ${session!.name}`,
      contactId,
    },
  });

  revalidatePath(`/contactos/${contactId}`);
  revalidatePath("/contactos");
}

export async function deleteContact(formData: FormData) {
  const session = await getSession();
  if (!canDelete(session?.role)) return;

  const contactId = formData.get("contactId") as string;
  if (!contactId) return;

  await prisma.contact.delete({ where: { id: contactId } });

  revalidatePath("/contactos");
  redirect("/contactos");
}
