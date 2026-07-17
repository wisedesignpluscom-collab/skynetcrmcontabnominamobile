"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { setPriceLocked } from "@/lib/services";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const s = await getSession();
  if (!s || s.role !== "admin") throw new Error("Solo un administrador.");
}

export async function addService(formData: FormData) {
  await requireAdmin();
  const name = (formData.get("name") as string)?.trim();
  const price = Number(formData.get("price")) || 0;
  if (!name) return;
  await prisma.service.create({ data: { name, price } });
  revalidatePath("/configuracion");
}

export async function updateService(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const price = Number(formData.get("price")) || 0;
  if (!id || !name) return;
  await prisma.service.update({ where: { id }, data: { name, price } });
  revalidatePath("/configuracion");
}

export async function toggleService(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  if (!id) return;
  await prisma.service.update({ where: { id }, data: { active } });
  revalidatePath("/configuracion");
}

export async function setLockPriceRule(formData: FormData) {
  await requireAdmin();
  await setPriceLocked(formData.get("locked") === "true");
  revalidatePath("/configuracion");
}
