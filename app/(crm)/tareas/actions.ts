"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { emitEventAndProcess } from "@/lib/engine/queue";
import { canAccessTask } from "@/lib/ownership";
import { revalidatePath } from "next/cache";

function revalidate() {
  revalidatePath("/tareas");
  revalidatePath("/calendario");
  revalidatePath("/");
}

// Fecha de vencimiento a partir del día elegido en la lista.
//
// La lista no tiene campo de hora, pero una tarea creada desde el calendario sí
// puede tenerla. Si se le cambia el día aquí, se le conserva su hora; solo las
// tareas de día completo van a mediodía (convención del proyecto: así el día
// elegido no se corre al anterior en la zona horaria de Venezuela).
function fechaConservandoHora(dia: string, previa: Date | null, tieneHora: boolean) {
  if (!dia) return null;
  if (!tieneHora || !previa) return new Date(`${dia}T12:00:00`);
  const hh = String(previa.getHours()).padStart(2, "0");
  const mm = String(previa.getMinutes()).padStart(2, "0");
  return new Date(`${dia}T${hh}:${mm}:00`);
}

export async function createTask(formData: FormData) {
  if (!(await getSession())) return; // requiere sesión válida
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;

  const rawDate = formData.get("dueDate") as string;

  const task = await prisma.task.create({
    data: {
      title,
      type: (formData.get("type") as string) || "seguimiento",
      dueDate: rawDate ? new Date(`${rawDate}T12:00:00`) : null,
      contactId: (formData.get("contactId") as string) || null,
    },
  });

  await emitEventAndProcess({
    type: "task.created",
    entity: "task",
    entityId: task.id,
    record: task,
  });

  revalidate();
}

// Corrige una tarea mal escrita o la reprograma. Solo toca lo que muestra la
// lista: hora, duración, responsable y descripción se conservan intactos,
// porque esos campos se editan en el calendario y aquí no se ven.
export async function updateTask(formData: FormData) {
  const session = await getSession();
  if (!session) return; // requiere sesión válida
  const id = formData.get("taskId") as string;
  if (!id) return;
  if (!(await canAccessTask(session, id))) return; // no editar tareas ajenas

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return;

  const title = (formData.get("title") as string)?.trim();
  if (!title) return; // sin título no se guarda: el formulario ya lo exige

  const dia = formData.get("dueDate") as string;

  await prisma.task.update({
    where: { id },
    data: {
      title,
      type: (formData.get("type") as string) || task.type,
      dueDate: fechaConservandoHora(dia, task.dueDate, task.hasTime),
      contactId: (formData.get("contactId") as string) || null,
    },
  });

  revalidate();
}

// Aplazar: corre la fecha límite N días. Si la tarea ya venció, cuenta desde
// hoy — aplazar «un día» una tarea de la semana pasada tiene que dejarla
// mañana, no en un día que también quedó atrás.
export async function postponeTask(formData: FormData) {
  const session = await getSession();
  if (!session) return; // requiere sesión válida
  const id = formData.get("taskId") as string;
  const dias = Number(formData.get("days"));
  if (!id || !Number.isFinite(dias) || dias <= 0) return;
  if (!(await canAccessTask(session, id))) return; // no aplazar tareas ajenas

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return;

  const ahora = new Date();
  // El día de partida es el suyo si aún no ha llegado; si ya venció, hoy.
  const base = task.dueDate && task.dueDate > ahora ? task.dueDate : ahora;
  const destino = new Date(base);
  destino.setDate(destino.getDate() + dias);
  // La hora es SIEMPRE la de la tarea, nunca la del reloj: aplazar una tarea
  // vencida de las 9:00 la deja a las 9:00 del nuevo día, no a la hora en que
  // se pulsó el botón. Sin hora propia, va a mediodía como el resto del proyecto.
  if (task.hasTime && task.dueDate) {
    destino.setHours(task.dueDate.getHours(), task.dueDate.getMinutes(), 0, 0);
  } else {
    destino.setHours(12, 0, 0, 0);
  }

  await prisma.task.update({ where: { id }, data: { dueDate: destino } });

  revalidate();
}

export async function toggleTask(formData: FormData) {
  const session = await getSession();
  if (!session) return; // requiere sesión válida
  const id = formData.get("taskId") as string;
  if (!id) return;
  if (!(await canAccessTask(session, id))) return; // no completar tareas ajenas

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

  if (done) {
    await emitEventAndProcess({
      type: "task.completed",
      entity: "task",
      entityId: task.id,
      record: { ...task, done: true },
    });
  }

  revalidate();
}
