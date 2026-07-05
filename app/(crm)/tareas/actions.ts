"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createTask(formData: FormData) {
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;

  const rawDate = formData.get("dueDate") as string;

  await prisma.task.create({
    data: {
      title,
      type: (formData.get("type") as string) || "seguimiento",
      dueDate: rawDate ? new Date(`${rawDate}T12:00:00`) : null,
      contactId: (formData.get("contactId") as string) || null,
    },
  });

  revalidatePath("/tareas");
  revalidatePath("/");
}

export async function toggleTask(formData: FormData) {
  const id = formData.get("taskId") as string;
  if (!id) return;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return;

  const done = !task.done;

  await prisma.task.update({
    where: { id },
    data: { done, completedAt: done ? new Date() : null },
  });

  if (done && task.contactId) {
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Tarea completada: ${task.title}`,
        contactId: task.contactId,
        dealId: task.dealId,
      },
    });
  }

  revalidatePath("/tareas");
  revalidatePath("/");
}
