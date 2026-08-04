import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { createTask, toggleTask, updateTask, postponeTask } from "./actions";
import { getOptions, iconFor } from "@/lib/catalog";
import { getSession } from "@/lib/session";
import { taskScope, contactScope } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("es", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

// Etiquetas para tipos antiguos guardados como clave; los nuevos se muestran tal cual
const legacyTypeLabels: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  reunion: "Reunión",
  seguimiento: "Seguimiento",
  otro: "Otro",
};

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

type TaskWithContact = Awaited<
  ReturnType<typeof prisma.task.findMany<{ include: { contact: true } }>>
>[number];

type ContactOption = { id: string; firstName: string; lastName: string };
type TypeOption = { id: string; label: string };

// Fecha para <input type="date">: en hora local, no UTC. Con toISOString() una
// tarea de mediodía en Venezuela se vería un día corrido en el formulario.
function toDateInput(d: Date | null) {
  if (!d) return "";
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function TaskRow({
  task,
  overdue,
  contacts,
  taskTypes,
}: {
  task: TaskWithContact;
  overdue?: boolean;
  contacts: ContactOption[];
  taskTypes: TypeOption[];
}) {
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
      <form action={toggleTask}>
        <input type="hidden" name="taskId" value={task.id} />
        <button
          type="submit"
          title={task.done ? "Reabrir tarea" : "Marcar como completada"}
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
            task.done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 hover:border-teal-500"
          }`}
        >
          {task.done && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${
            task.done ? "text-slate-400 line-through" : "text-slate-800"
          }`}
        >
          {task.title}
        </p>
        <p className="text-xs text-slate-500">
          {iconFor(task.type)} {legacyTypeLabels[task.type] ?? task.type}
          {task.contact && (
            <>
              {" · "}
              <Link
                href={`/contactos/${task.contact.id}`}
                className="text-teal-600 hover:underline"
              >
                {task.contact.firstName} {task.contact.lastName}
              </Link>
            </>
          )}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
          overdue
            ? "bg-red-50 text-red-600"
            : task.done
            ? "bg-slate-100 text-slate-400"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {task.dueDate ? dateFmt.format(task.dueDate) : "Sin fecha"}
      </span>
      </div>

      {/* Corregir o reprogramar. <details> nativo: la lista sigue siendo un
          Server Component, sin estado de cliente para abrir un modal. */}
      <details className="group mt-1 pl-8">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-400 hover:text-teal-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path
              d="M11 4H4v16h16v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="group-open:hidden">Editar</span>
          <span className="hidden group-open:inline">Cerrar</span>
        </summary>

        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <form action={updateTask} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="taskId" value={task.id} />
            <label className="min-w-48 flex-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Tarea
              </span>
              <input
                name="title"
                required
                defaultValue={task.title}
                className={`${inputClass} w-full`}
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Tipo
              </span>
              <select name="type" defaultValue={task.type} className={inputClass}>
                {/* El tipo guardado puede ya no estar en el catálogo (se editó o
                    se desactivó): se agrega para no cambiarlo sin querer. */}
                {!taskTypes.some((t) => t.label === task.type) && (
                  <option value={task.type}>
                    {legacyTypeLabels[task.type] ?? task.type}
                  </option>
                )}
                {taskTypes.map((t) => (
                  <option key={t.id} value={t.label}>
                    {iconFor(t.label)} {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Fecha límite
              </span>
              <input
                name="dueDate"
                type="date"
                defaultValue={toDateInput(task.dueDate)}
                className={inputClass}
              />
            </label>
            <label className="max-w-44">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Contacto
              </span>
              <select
                name="contactId"
                defaultValue={task.contactId ?? ""}
                className={`${inputClass} w-full`}
              >
                <option value="">Sin contacto</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
            >
              Guardar
            </button>
          </form>

          {/* Aplazar va en su propio formulario: HTML no permite anidarlos */}
          {!task.done && (
            <form action={postponeTask} className="flex items-center gap-2">
              <input type="hidden" name="taskId" value={task.id} />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Aplazar
              </span>
              {[
                { dias: 1, texto: "1 día" },
                { dias: 7, texto: "1 semana" },
              ].map((o) => (
                <button
                  key={o.dias}
                  type="submit"
                  name="days"
                  value={o.dias}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-teal-500 hover:text-teal-700"
                >
                  +{o.texto}
                </button>
              ))}
            </form>
          )}
        </div>
      </details>
    </li>
  );
}

export default async function TareasPage() {
  const session = await getSession();
  const [tasks, contacts, taskTypes] = await Promise.all([
    prisma.task.findMany({
      where: taskScope(session),
      include: { contact: true },
      orderBy: [{ done: "asc" }, { dueDate: "asc" }],
    }),
    prisma.contact.findMany({
      where: contactScope(session),
      orderBy: { firstName: "asc" },
    }),
    getOptions("task_type"),
  ]);

  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const pending = tasks.filter((t) => !t.done);
  const overdue = pending.filter((t) => t.dueDate && t.dueDate < todayStart);
  const today = pending.filter(
    (t) => t.dueDate && t.dueDate >= todayStart && t.dueDate <= todayEnd
  );
  const upcoming = pending.filter((t) => t.dueDate && t.dueDate > todayEnd);
  const noDate = pending.filter((t) => !t.dueDate);
  const completed = tasks.filter((t) => t.done).slice(0, 10);

  const groups = [
    { title: "Vencidas", tasks: overdue, isOverdue: true },
    { title: "Para hoy", tasks: today },
    { title: "Próximas", tasks: upcoming },
    { title: "Sin fecha", tasks: noDate },
  ].filter((g) => g.tasks.length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Tareas</h1>
        <p className="text-sm text-slate-500">
          {pending.length} pendientes
          {overdue.length > 0 && (
            <span className="font-medium text-red-600"> · {overdue.length} vencidas</span>
          )}
        </p>
      </header>

      {/* Creación rápida */}
      <form
        action={createTask}
        className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <input
          name="title"
          required
          placeholder="Nueva tarea… ej: Llamar a Ana para agendar demo"
          className={`${inputClass} min-w-48 flex-1`}
        />
        <select
          name="type"
          defaultValue={taskTypes[0]?.label ?? "Seguimiento"}
          className={inputClass}
        >
          {taskTypes.map((t) => (
            <option key={t.id} value={t.label}>
              {iconFor(t.label)} {t.label}
            </option>
          ))}
        </select>
        <input name="dueDate" type="date" className={inputClass} />
        <select name="contactId" defaultValue="" className={`${inputClass} max-w-44`}>
          <option value="">Sin contacto</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          Agregar
        </button>
      </form>

      {/* Grupos de pendientes */}
      {groups.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
          🎉 No tienes tareas pendientes.
        </p>
      )}
      {groups.map((group) => (
        <section
          key={group.title}
          className="rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm"
        >
          <h2
            className={`mb-1 text-sm font-semibold uppercase tracking-wide ${
              group.isOverdue ? "text-red-600" : "text-slate-500"
            }`}
          >
            {group.title} ({group.tasks.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {group.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                overdue={group.isOverdue}
                contacts={contacts}
                taskTypes={taskTypes}
              />
            ))}
          </ul>
        </section>
      ))}

      {/* Completadas recientes */}
      {completed.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Completadas recientes
          </h2>
          <ul className="divide-y divide-slate-100">
            {completed.map((t) => (
              <TaskRow key={t.id} task={t} contacts={contacts} taskTypes={taskTypes} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
