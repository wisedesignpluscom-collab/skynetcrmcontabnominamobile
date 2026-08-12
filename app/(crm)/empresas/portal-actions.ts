"use server";

// Gestión de accesos al portal de clientes (Fase 1). Igual que plan-actions.ts:
// cuelga de la ficha del cliente. A diferencia del plan (que gestiona quien vea
// al cliente), crear/desactivar/resetear una credencial de acceso externo exige
// además canManagePortalAccess (admin/supervisor) — es equivalente en
// sensibilidad a crear un usuario interno.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canAccessCompany } from "@/lib/ownership";
import { canManagePortalAccess } from "@/lib/permissions";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

async function sesionConGestion(companyId: string) {
  const session = await getSession();
  if (!session || !companyId) return null;
  if (!canManagePortalAccess(session.role)) return null;
  return (await canAccessCompany(session, companyId)) ? session : null;
}

export async function crearPortalUser(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const session = await sesionConGestion(companyId);
  if (!session) return;

  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  if (!name || !email || !password || password.length < 8) return;

  const exists = await prisma.portalUser.findUnique({ where: { email } });
  if (exists) return;

  await prisma.portalUser.create({
    data: {
      companyId,
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      createdById: session.id,
    },
  });
  revalidatePath(`/empresas/${companyId}`);
}

export async function toggleActivoPortalUser(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConGestion(companyId))) return;
  const id = formData.get("id") as string;
  const activar = formData.get("activar") === "1";
  if (!id) return;

  await prisma.portalUser.update({
    where: { id },
    data: activar
      ? { active: true, failedAttempts: 0, lockedUntil: null }
      : { active: false },
  });
  revalidatePath(`/empresas/${companyId}`);
}

export async function resetPasswordPortalUser(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  if (!(await sesionConGestion(companyId))) return;
  const id = formData.get("id") as string;
  const password = formData.get("password") as string;
  if (!id || !password || password.length < 8) return;

  await prisma.portalUser.update({
    where: { id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
  revalidatePath(`/empresas/${companyId}`);
}
