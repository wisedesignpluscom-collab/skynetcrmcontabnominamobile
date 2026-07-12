"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { emitEventAndProcess } from "@/lib/engine/queue";
import { revalidatePath } from "next/cache";

function revalidate() {
  revalidatePath("/calendario");
  revalidatePath("/tareas");
  revalidatePath("/");
}

// Construye la fecha/hora a partir del formulario (hora local del servidor).
function buildDueDate(date: string, allDay: boolean, time: string): Date | null {
  if (!date) return null;
  return allDay
    ? new Date(`${date}T12:00:00`)
    : new Date(`${date}T${time || "09:00"}:00`);
}

type TaskForm = {
  title: string;
  type: string;
  date: string;
  allDay: boolean;
  time: string;
  durationMin: number | null;
  ownerId: string | null;
  contactId: string | null;
  description: string | null;
};

function parse(formData: FormData): TaskForm {
  const allDay = formData.get("allDay") === "on" || formData.get("allDay") === "true";
  const dur = Number(formData.get("durationMin"));
  return {
    title: (formData.get("title") as string)?.trim() ?? "",
    type: (formData.get("type") as string) || "seguimiento",
    date: (formData.get("date") as string) ?? "",
    allDay,
    time: (formData.get("time") as string) ?? "",
    durationMin: allDay || !Number.isFinite(dur) || dur <= 0 ? null : dur,
    ownerId: (formData.get("ownerId") as string) || null,
    contactId: (formData.get("contactId") as string) || null,
    description: ((formData.get("description") as string) || "").trim() || null,
  };
}

export async function createCalendarTask(formData: FormData) {
  const session = await getSession();
  const f = parse(formData);
  if (!f.title || !f.date) return;

  const task = await prisma.task.create({
    data: {
      title: f.title,
      type: f.type,
      description: f.description,
      dueDate: buildDueDate(f.date, f.allDay, f.time),
      hasTime: !f.allDay,
      durationMin: f.durationMin,
      ownerId: f.ownerId ?? session?.id ?? null,
      contactId: f.contactId,
    },
  });

  await emitEventAndProcess({
    type: "task.created",
    entity: "task",
    entityId: task.id,
    record: task as unknown as Record<string, unknown>,
    user: session,
  });

  revalidate();
}

export async function updateCalendarTask(formData: FormData) {
  await getSession();
  const id = formData.get("taskId") as string;
  if (!id) return;
  const f = parse(formData);
  if (!f.title || !f.date) return;

  await prisma.task.update({
    where: { id },
    data: {
      title: f.title,
      type: f.type,
      description: f.description,
      dueDate: buildDueDate(f.date, f.allDay, f.time),
      hasTime: !f.allDay,
      durationMin: f.durationMin,
      ownerId: f.ownerId,
      contactId: f.contactId,
    },
  });
  revalidate();
}

export async function toggleCalendarTask(formData: FormData) {
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
      data: { type: "sistema", content: `Tarea completada: ${task.title}`, contactId: task.contactId, dealId: task.dealId },
    });
  }
  if (done) {
    await emitEventAndProcess({
      type: "task.completed",
      entity: "task",
      entityId: task.id,
      record: { ...task, done: true } as unknown as Record<string, unknown>,
    });
  }
  revalidate();
}

export async function deleteCalendarTask(formData: FormData) {
  const id = formData.get("taskId") as string;
  if (!id) return;
  await prisma.task.delete({ where: { id } });
  revalidate();
}
