"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("Solo un administrador puede modificar la configuración.");
  }
}

function revalidateForms() {
  revalidatePath("/configuracion");
  revalidatePath("/contactos/nuevo");
  revalidatePath("/empresas/nueva");
  revalidatePath("/tareas");
  revalidatePath("/pipeline");
}

// ── Catálogos ────────────────────────────────────────────────────

export async function addCatalogOption(formData: FormData) {
  await requireAdmin();
  const category = formData.get("category") as string;
  const label = (formData.get("label") as string)?.trim();
  if (!category || !label) return;

  const exists = await prisma.catalogOption.findUnique({
    where: { category_label: { category, label } },
  });
  if (exists) {
    // Si existía desactivada, se reactiva
    await prisma.catalogOption.update({ where: { id: exists.id }, data: { active: true } });
  } else {
    const max = await prisma.catalogOption.aggregate({
      where: { category },
      _max: { order: true },
    });
    await prisma.catalogOption.create({
      data: { category, label, order: (max._max.order ?? 0) + 1 },
    });
  }
  revalidateForms();
}

export async function renameCatalogOption(formData: FormData) {
  await requireAdmin();
  const id = formData.get("optionId") as string;
  const label = (formData.get("label") as string)?.trim();
  if (!id || !label) return;

  const option = await prisma.catalogOption.findUnique({ where: { id } });
  if (!option || option.label === label) return;

  const duplicate = await prisma.catalogOption.findUnique({
    where: { category_label: { category: option.category, label } },
  });
  if (duplicate) return;

  await prisma.catalogOption.update({ where: { id }, data: { label } });
  revalidateForms();
}

export async function toggleCatalogOption(formData: FormData) {
  await requireAdmin();
  const id = formData.get("optionId") as string;
  if (!id) return;

  const option = await prisma.catalogOption.findUnique({ where: { id } });
  if (!option) return;

  await prisma.catalogOption.update({
    where: { id },
    data: { active: !option.active },
  });
  revalidateForms();
}

// ── Etapas del pipeline ──────────────────────────────────────────

export async function addStage(formData: FormData) {
  await requireAdmin();
  const name = (formData.get("name") as string)?.trim();
  const color = (formData.get("color") as string) || "#3b82f6";
  if (!name) return;

  // La etapa nueva entra al final de las abiertas, antes de Ganado/Perdido
  const closingStages = await prisma.pipelineStage.findMany({
    where: { type: { in: ["won", "lost"] } },
    orderBy: { order: "asc" },
  });
  const firstClosing = closingStages[0]?.order ?? 99;

  await prisma.pipelineStage.updateMany({
    where: { type: { in: ["won", "lost"] } },
    data: { order: { increment: 1 } },
  });
  await prisma.pipelineStage.create({
    data: { name, color, type: "open", order: firstClosing },
  });
  revalidateForms();
}

export async function updateStage(formData: FormData) {
  await requireAdmin();
  const id = formData.get("stageId") as string;
  const name = (formData.get("name") as string)?.trim();
  const color = formData.get("color") as string;
  if (!id || !name) return;

  await prisma.pipelineStage.update({
    where: { id },
    data: { name, ...(color ? { color } : {}) },
  });
  revalidateForms();
}

export async function moveStage(formData: FormData) {
  await requireAdmin();
  const id = formData.get("stageId") as string;
  const direction = formData.get("direction") as string; // up | down
  if (!id) return;

  const stage = await prisma.pipelineStage.findUnique({ where: { id } });
  if (!stage || stage.type !== "open") return;

  const neighbor = await prisma.pipelineStage.findFirst({
    where: {
      type: "open",
      order: direction === "up" ? { lt: stage.order } : { gt: stage.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  // Intercambiar posiciones
  await prisma.pipelineStage.update({ where: { id: stage.id }, data: { order: neighbor.order } });
  await prisma.pipelineStage.update({ where: { id: neighbor.id }, data: { order: stage.order } });
  revalidateForms();
}

export async function deleteStage(formData: FormData) {
  await requireAdmin();
  const id = formData.get("stageId") as string;
  if (!id) return;

  const stage = await prisma.pipelineStage.findUnique({
    where: { id },
    include: { _count: { select: { deals: true } } },
  });
  // Solo etapas abiertas, sin oportunidades dentro
  if (!stage || stage.type !== "open" || stage._count.deals > 0) return;

  await prisma.pipelineStage.delete({ where: { id } });
  revalidateForms();
}
