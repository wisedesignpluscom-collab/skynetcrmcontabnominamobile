import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addActivity, reassignContact, deleteContact } from "../actions";
import WhatsAppButton from "@/components/WhatsAppButton";
import { hasValidPhone } from "@/lib/whatsapp";
import { getSession } from "@/lib/session";
import { canDelete, canReassign } from "@/lib/permissions";
import { getOptions, iconFor } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const sourceLabels: Record<string, string> = {
  web: "Sitio web",
  referido: "Referido",
  redes: "Redes sociales",
  llamada: "Llamada",
  evento: "Evento",
  otro: "Otro",
};

// Etiquetas para tipos antiguos guardados como clave; los nuevos se muestran tal cual
const legacyTypeLabels: Record<string, string> = {
  nota: "Nota",
  llamada: "Llamada",
  email: "Email",
  reunion: "Reunión",
  whatsapp: "WhatsApp",
  sistema: "Sistema",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default async function ContactoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      company: true,
      owner: true,
      deals: { include: { stage: true }, orderBy: { createdAt: "desc" } },
      tasks: { where: { done: false }, orderBy: { dueDate: "asc" } },
      activities: { orderBy: { createdAt: "desc" } },
      followUps: { include: { deal: true } },
    },
  });

  if (!contact) notFound();

  const [users, interactionTypes] = await Promise.all([
    canReassign(session?.role)
      ? prisma.user.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    getOptions("task_type"),
  ]);

  const infoRows = [
    { label: "Email", value: contact.email },
    { label: "Teléfono", value: contact.phone },
    { label: "Cargo", value: contact.position },
    { label: "Empresa", value: contact.company?.name },
    { label: "Origen", value: contact.source ? sourceLabels[contact.source] ?? contact.source : null },
    { label: "Vendedor", value: contact.owner?.name },
    { label: "Creado", value: dateFmt.format(contact.createdAt) },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/contactos" className="text-sm font-medium text-teal-600 hover:underline">
            ← Volver a contactos
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-blue-600 text-base font-bold text-white">
              {contact.firstName[0]}
              {contact.lastName[0]}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {contact.firstName} {contact.lastName}
              </h1>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  contact.status === "cliente"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-blue-50 text-blue-700"
                }`}
              >
                {contact.status === "cliente" ? "Cliente" : "Lead"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasValidPhone(contact.phone) && (
            <WhatsAppButton
              phone={contact.phone}
              message={`Hola ${contact.firstName}, ¿cómo estás? Te escribo para hacer seguimiento. ¿Tienes un momento?`}
              label="Escribir por WhatsApp"
            />
          )}
          {canDelete(session?.role) && (
            <form action={deleteContact}>
              <input type="hidden" name="contactId" value={contact.id} />
              <button
                type="submit"
                title="Eliminar contacto (borra su historial y tareas)"
                className="rounded-lg border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
              >
                Eliminar
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Columna izquierda: datos */}
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-900">Información</h2>
            <dl className="space-y-3 text-sm">
              {infoRows.map((row) => (
                <div key={row.label} className="flex justify-between gap-4">
                  <dt className="text-slate-500">{row.label}</dt>
                  <dd className="text-right font-medium text-slate-800">
                    {row.value ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
            {contact.notes && (
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                {contact.notes}
              </p>
            )}
            {canReassign(session?.role) && (
              <form
                action={reassignContact}
                className="mt-4 flex gap-2 border-t border-slate-100 pt-4"
              >
                <input type="hidden" name="contactId" value={contact.id} />
                <select
                  name="ownerId"
                  defaultValue={contact.ownerId ?? ""}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none transition-colors focus:border-teal-500"
                >
                  <option value="">Sin vendedor</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                >
                  Reasignar
                </button>
              </form>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-900">Oportunidades</h2>
            {contact.deals.length === 0 ? (
              <p className="text-sm text-slate-400">Sin oportunidades todavía.</p>
            ) : (
              <ul className="space-y-3">
                {contact.deals.map((d) => (
                  <li key={d.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-800">{d.title}</p>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span
                        className="rounded-full px-2 py-0.5 font-medium text-white"
                        style={{ backgroundColor: d.stage.color }}
                      >
                        {d.stage.name}
                      </span>
                      <span className="font-semibold text-slate-700">
                        {money.format(d.amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-900">Tareas pendientes</h2>
            {contact.tasks.length === 0 ? (
              <p className="text-sm text-slate-400">Sin tareas pendientes.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {contact.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between">
                    <span className="text-slate-700">{t.title}</span>
                    <span className="text-xs text-slate-400">
                      {t.dueDate ? dateFmt.format(t.dueDate) : "Sin fecha"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Columna derecha: historial */}
        <div className="space-y-6 xl:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-900">Registrar interacción</h2>
            <form action={addActivity} className="space-y-3">
              <input type="hidden" name="contactId" value={contact.id} />
              <div className="flex gap-3">
                <select
                  name="type"
                  defaultValue={interactionTypes[0]?.label ?? "Nota"}
                  className={`${inputClass} w-44`}
                >
                  {interactionTypes.map((t) => (
                    <option key={t.id} value={t.label}>
                      {iconFor(t.label)} {t.label}
                    </option>
                  ))}
                </select>
                <input
                  name="content"
                  required
                  placeholder="¿Qué pasó con este contacto? Ej: llamada de seguimiento, pidió cotización…"
                  className={inputClass}
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
                >
                  Guardar
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-900">
              Historial ({contact.activities.length})
            </h2>
            {contact.activities.length === 0 ? (
              <p className="text-sm text-slate-400">
                Aún no hay interacciones registradas con este contacto.
              </p>
            ) : (
              <ol className="relative space-y-5 border-l border-slate-200 pl-6">
                {contact.activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm ring-1 ring-slate-200">
                      {iconFor(a.type)}
                    </span>
                    <p className="text-sm text-slate-700">{a.content}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {legacyTypeLabels[a.type] ?? a.type} · {dateFmt.format(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
