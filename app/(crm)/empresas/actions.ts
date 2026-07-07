"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { emitEventAndProcess } from "@/lib/engine/queue";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createCompany(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  const company = await prisma.company.create({
    data: {
      name,
      industry: (formData.get("industry") as string)?.trim() || null,
      website: (formData.get("website") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      address: (formData.get("address") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
    },
  });

  const session = await getSession();
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
