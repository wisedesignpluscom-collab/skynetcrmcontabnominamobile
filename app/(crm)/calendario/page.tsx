import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getOptions } from "@/lib/catalog";
import CalendarView, { type CalEvent } from "@/components/calendar/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Ventana de datos: 3 meses atrás a 12 adelante (el cliente filtra por vista)
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  const to = new Date();
  to.setMonth(to.getMonth() + 12);

  const [tasks, users, contacts, taskTypeOptions] = await Promise.all([
    prisma.task.findMany({
      where: { dueDate: { gte: from, lte: to } },
      include: { contact: { select: { firstName: true, lastName: true } }, owner: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.contact.findMany({ orderBy: [{ firstName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    getOptions("task_type"),
  ]);

  const events: CalEvent[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    type: t.type,
    dueDate: (t.dueDate as Date).toISOString(),
    hasTime: t.hasTime,
    durationMin: t.durationMin,
    done: t.done,
    ownerId: t.ownerId,
    ownerName: t.owner?.name ?? null,
    contactId: t.contactId,
    contactName: t.contact ? `${t.contact.firstName} ${t.contact.lastName}` : null,
  }));

  const canSeeAll = session.role === "admin" || session.role === "supervisor";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Calendario</h1>
        <p className="text-sm text-slate-500">
          Tus tareas y llamadas en agenda. Haz clic en un día u hora para crear, o en una tarea
          para editarla.
        </p>
      </header>

      <CalendarView
        events={events}
        users={users}
        contacts={contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }))}
        taskTypes={taskTypeOptions.map((o) => o.label)}
        canSeeAll={canSeeAll}
        currentUserId={session.id}
      />
    </div>
  );
}
