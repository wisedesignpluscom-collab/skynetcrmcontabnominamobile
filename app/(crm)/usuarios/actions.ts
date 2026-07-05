"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { ROLES } from "@/lib/permissions";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("Solo un administrador puede gestionar usuarios.");
  }
  return session;
}

export async function createUser(formData: FormData) {
  await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  if (!name || !email || !password || password.length < 6) return;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return;

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: ROLES.includes(formData.get("role") as (typeof ROLES)[number])
        ? (formData.get("role") as string)
        : "vendedor",
    },
  });

  revalidatePath("/usuarios");
}

export async function updatePassword(formData: FormData) {
  await requireAdmin();

  const id = formData.get("userId") as string;
  const password = formData.get("password") as string;
  if (!id || !password || password.length < 6) return;

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });

  revalidatePath("/usuarios");
}

export async function deleteUser(formData: FormData) {
  const session = await requireAdmin();

  const id = formData.get("userId") as string;
  if (!id) return;

  // Nadie puede borrarse a sí mismo
  if (id === session.id) return;

  // No se puede borrar al último administrador
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return;
  if (target.role === "admin") {
    const admins = await prisma.user.count({ where: { role: "admin" } });
    if (admins <= 1) return;
  }

  await prisma.user.delete({ where: { id } });
  revalidatePath("/usuarios");
}
