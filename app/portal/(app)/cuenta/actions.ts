"use server";

import { prisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/portalSession";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

export async function cambiarPasswordPortal(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
) {
  const session = await getPortalSession();
  if (!session) return { error: "Sesión expirada. Vuelve a iniciar sesión." };

  const actual = formData.get("actual") as string;
  const nueva = formData.get("nueva") as string;
  const confirmar = formData.get("confirmar") as string;

  if (!actual || !nueva || !confirmar) return { error: "Completa todos los campos." };
  if (nueva.length < 8) return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
  if (nueva !== confirmar) return { error: "La confirmación no coincide con la nueva contraseña." };

  const user = await prisma.portalUser.findUnique({ where: { id: session.id } });
  if (!user || !user.active) return { error: "Sesión expirada. Vuelve a iniciar sesión." };

  const valid = await bcrypt.compare(actual, user.passwordHash);
  if (!valid) return { error: "La contraseña actual no es correcta." };

  await prisma.portalUser.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(nueva, 10), mustChangePassword: false },
  });

  revalidatePath("/portal");
  return { ok: true };
}
