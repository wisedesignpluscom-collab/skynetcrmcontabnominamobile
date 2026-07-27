import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getOptions } from "@/lib/catalog";
import { taskScope, contactScope, recurringCaseScope } from "@/lib/permissions";
import CalendarView, { type CalEvent } from "@/components/calendar/CalendarView";
import { casoCerrado } from "@/lib/casos";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Ventana de datos: 3 meses atrás a 12 adelante (el cliente filtra por vista)
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  const to = new Date();
  to.setMonth(to.getMonth() + 12);

  const [tasks, casos, users, contacts, taskTypeOptions] = await Promise.all([
    prisma.task.findMany({
      where: { dueDate: { gte: from, lte: to }, ...taskScope(session) },
      include: { contact: { select: { firstName: true, lastName: true } }, owner: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    // Vencimientos fiscales (F4): mismo alcance por rol que la bandeja de casos
    prisma.casoRecurrente.findMany({
      where: { fechaLimite: { gte: from, lte: to }, ...recurringCaseScope(session) },
      include: {
        company: { select: { id: true, name: true } },
        obligacion: { select: { nombre: true, enteReceptor: true } },
        analista: { select: { name: true } },
      },
      orderBy: { fechaLimite: "asc" },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.contact.findMany({ where: contactScope(session), orderBy: [{ firstName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    getOptions("task_type"),
  ]);

  const eventosDeTareas: CalEvent[] = tasks.map((t) => ({
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
    kind: "task",
  }));

  // Los vencimientos no se editan aquí: el clic lleva a la bandeja de casos
  // filtrada por su período. `done` = presentado, así el calendario los tacha
  // con el mismo tratamiento que las tareas cumplidas.
  const eventosDeObligaciones: CalEvent[] = casos.map((c) => ({
    id: `caso-${c.id}`,
    title: `${c.obligacion.nombre} · ${c.company.name}`,
    type: "obligacion",
    dueDate: (c.fechaLimite as Date).toISOString(),
    hasTime: false,
    durationMin: null,
    done: casoCerrado(c.estado),
    ownerId: c.analistaId,
    ownerName: c.analista?.name ?? null,
    contactId: null,
    contactName: c.company.name,
    kind: "obligacion",
    href: `/casos?periodo=${c.periodoFiscal.slice(0, 7)}`,
  }));

  const events = [...eventosDeTareas, ...eventosDeObligaciones];

  const canSeeAll = session.role === "admin" || session.role === "supervisor";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Calendario</h1>
        <p className="text-sm text-slate-500">
          Tus tareas y llamadas en agenda, junto a los vencimientos fiscales de tus clientes. Haz
          clic en un día u hora para crear, en una tarea para editarla o en un vencimiento para
          trabajarlo en la bandeja de casos.
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
