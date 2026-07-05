"use server";

import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "Escribe tu email y contraseña." };

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user && (await bcrypt.compare(password, user.passwordHash));

  if (!valid) return { error: "Email o contraseña incorrectos." };

  await createSession({ id: user.id, name: user.name, email: user.email, role: user.role });
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
