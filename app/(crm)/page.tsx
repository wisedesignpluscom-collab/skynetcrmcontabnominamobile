import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { iconFor } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
});

// Etiquetas para tipos antiguos guardados como clave; los nuevos se muestran tal cual
const legacyTypeLabels: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  reunion: "Reunión",
  seguimiento: "Seguimiento",
  nota: "Nota",
  otro: "Otro",
};

export default async function DashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    newLeads,
    openDeals,
    wonThisMonth,
    pendingTasks,
    stages,
    upcomingTasks,
    recentActivities,
    followUpsDue,
  ] = await Promise.all([
    prisma.contact.count({
      where: { status: "lead", createdAt: { gte: monthStart } },
    }),
    prisma.deal.findMany({ where: { status: "open" }, select: { amount: true } }),
    prisma.deal.findMany({
      where: { status: "won", closedAt: { gte: monthStart } },
      select: { amount: true },
    }),
    prisma.task.count({ where: { done: false } }),
    prisma.pipelineStage.findMany({
      where: { type: "open" },
      orderBy: { order: "asc" },
      include: {
        deals: { where: { status: "open" }, select: { amount: true } },
      },
    }),
    prisma.task.findMany({
      where: { done: false },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { contact: true, deal: true },
    }),
    prisma.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { contact: true, deal: true },
    }),
    prisma.followUp.findMany({
      where: { nextContactDate: { lte: new Date(now.getTime() + 7 * 86400000) } },
      orderBy: { nextContactDate: "asc" },
      take: 4,
      include: { contact: true, deal: true },
    }),
  ]);

  const pipelineValue = openDeals.reduce((s, d) => s + d.amount, 0);
  const salesThisMonth = wonThisMonth.reduce((s, d) => s + d.amount, 0);
  const maxStageCount = Math.max(1, ...stages.map((s) => s.deals.length));

  const kpis = [
    {
      label: "Leads nuevos (mes)",
      value: String(newLeads),
      sub: "contactos por trabajar",
      accent: "bg-blue-500",
    },
    {
      label: "Pipeline abierto",
      value: money.format(pipelineValue),
      sub: `${openDeals.length} oportunidades activas`,
      accent: "bg-teal-500",
    },
    {
      label: "Ventas del mes",
      value: money.format(salesThisMonth),
      sub: `${wonThisMonth.length} negocios ganados`,
      accent: "bg-emerald-500",
    },
    {
      label: "Tareas pendientes",
      value: String(pendingTasks),
      sub: "por completar",
      accent: "bg-amber-500",
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Resumen de tu operación comercial — del lead a la venta y la posventa.
        </p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${kpi.accent}`} />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {kpi.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{kpi.value}</p>
            <p className="mt-1 text-xs text-slate-400">{kpi.sub}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Embudo */}
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Embudo de ventas</h2>
            <Link href="/pipeline" className="text-sm font-medium text-teal-600 hover:underline">
              Ver pipeline →
            </Link>
          </div>
          <div className="space-y-3">
            {stages.map((stage) => {
              const value = stage.deals.reduce((s, d) => s + d.amount, 0);
              const pct = (stage.deals.length / maxStageCount) * 100;
              return (
                <div key={stage.id} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-sm text-slate-600">{stage.name}</span>
                  <div className="h-7 flex-1 overflow-hidden rounded-md bg-slate-100">
                    <div
                      className="flex h-full items-center rounded-md px-2 text-xs font-semibold text-white"
                      style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: stage.color }}
                    >
                      {stage.deals.length}
                    </div>
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm font-medium text-slate-700">
                    {money.format(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Posventa próxima */}
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Posventa esta semana</h2>
            <Link href="/posventa" className="text-sm font-medium text-teal-600 hover:underline">
              Ver todo →
            </Link>
          </div>
          {followUpsDue.length === 0 ? (
            <p className="text-sm text-slate-400">Sin contactos de posventa programados.</p>
          ) : (
            <ul className="space-y-3">
              {followUpsDue.map((f) => (
                <li key={f.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-800">
                    {f.contact.firstName} {f.contact.lastName}
                  </p>
                  <p className="text-xs text-slate-500">{f.deal.title}</p>
                  <p className="mt-1 text-xs font-medium text-amber-600">
                    Próximo contacto:{" "}
                    {f.nextContactDate ? dateFmt.format(f.nextContactDate) : "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Tareas próximas */}
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Tareas próximas</h2>
            <Link href="/tareas" className="text-sm font-medium text-teal-600 hover:underline">
              Ver todas →
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {upcomingTasks.map((t) => {
              const overdue = t.dueDate && t.dueDate < now;
              return (
                <li key={t.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-500">
                      {iconFor(t.type)} {legacyTypeLabels[t.type] ?? t.type}
                      {t.contact && ` · ${t.contact.firstName} ${t.contact.lastName}`}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      overdue
                        ? "bg-red-50 text-red-600"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {t.dueDate ? dateFmt.format(t.dueDate) : "Sin fecha"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Actividad reciente */}
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 font-semibold text-slate-900">Actividad reciente</h2>
          <ul className="space-y-3">
            {recentActivities.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className="shrink-0">{iconFor(a.type)}</span>
                <div>
                  <p className="text-slate-700">{a.content}</p>
                  <p className="text-xs text-slate-400">
                    {a.contact && `${a.contact.firstName} ${a.contact.lastName} · `}
                    {dateFmt.format(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
