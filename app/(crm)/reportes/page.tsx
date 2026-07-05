import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const monthFmt = new Intl.DateTimeFormat("es", { month: "short" });

const sourceLabels: Record<string, string> = {
  web: "Sitio web",
  referido: "Referido",
  redes: "Redes sociales",
  llamada: "Llamada",
  evento: "Evento",
  otro: "Otro",
  sin_origen: "Sin origen",
};

export default async function ReportesPage() {
  const [wonDeals, lostDeals, openDeals, contacts, stages] = await Promise.all([
    prisma.deal.findMany({ where: { status: "won" } }),
    prisma.deal.findMany({ where: { status: "lost" } }),
    prisma.deal.findMany({ where: { status: "open" } }),
    prisma.contact.findMany(),
    prisma.pipelineStage.findMany({
      where: { type: "open" },
      orderBy: { order: "asc" },
      include: { deals: { where: { status: "open" } } },
    }),
  ]);

  // ── KPIs generales ──────────────────────────────────────────────
  const totalWonValue = wonDeals.reduce((s, d) => s + d.amount, 0);
  const closedCount = wonDeals.length + lostDeals.length;
  const conversionRate = closedCount > 0 ? (wonDeals.length / closedCount) * 100 : 0;
  const avgTicket = wonDeals.length > 0 ? totalWonValue / wonDeals.length : 0;
  const avgDaysToClose =
    wonDeals.length > 0
      ? wonDeals.reduce((s, d) => {
          const days = d.closedAt
            ? (d.closedAt.getTime() - d.createdAt.getTime()) / 86400000
            : 0;
          return s + days;
        }, 0) / wonDeals.length
      : 0;

  // ── Ventas por mes (últimos 6 meses) ────────────────────────────
  const now = new Date();
  const months: { label: string; value: number; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthDeals = wonDeals.filter(
      (d) => d.closedAt && d.closedAt >= start && d.closedAt < end
    );
    months.push({
      label: monthFmt.format(start),
      value: monthDeals.reduce((s, d) => s + d.amount, 0),
      count: monthDeals.length,
    });
  }
  const maxMonth = Math.max(1, ...months.map((m) => m.value));

  // ── Origen de leads ─────────────────────────────────────────────
  const bySource = new Map<string, { total: number; clients: number }>();
  for (const c of contacts) {
    const key = c.source ?? "sin_origen";
    const entry = bySource.get(key) ?? { total: 0, clients: 0 };
    entry.total += 1;
    if (c.status === "cliente") entry.clients += 1;
    bySource.set(key, entry);
  }
  const sources = [...bySource.entries()].sort((a, b) => b[1].total - a[1].total);
  const maxSource = Math.max(1, ...sources.map(([, v]) => v.total));

  // ── Embudo actual ───────────────────────────────────────────────
  const maxStage = Math.max(1, ...stages.map((s) => s.deals.length));

  const kpis = [
    {
      label: "Tasa de conversión",
      value: `${conversionRate.toFixed(0)}%`,
      sub: `${wonDeals.length} ganadas de ${closedCount} cerradas`,
      accent: "bg-teal-500",
    },
    {
      label: "Total vendido",
      value: money.format(totalWonValue),
      sub: "histórico de ventas ganadas",
      accent: "bg-emerald-500",
    },
    {
      label: "Venta promedio",
      value: money.format(avgTicket),
      sub: "valor medio por negocio ganado",
      accent: "bg-blue-500",
    },
    {
      label: "Días para cerrar",
      value: avgDaysToClose.toFixed(0),
      sub: "promedio del lead al cierre",
      accent: "bg-amber-500",
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
        <p className="text-sm text-slate-500">
          Análisis del rendimiento comercial para tomar mejores decisiones.
        </p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
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

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Ventas por mes */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Ventas por mes</h2>
          <p className="mb-6 text-xs text-slate-400">Valor de negocios ganados, últimos 6 meses</p>
          <div className="flex h-48 items-end gap-3">
            {months.map((m, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold text-slate-700">
                  {m.value > 0 ? money.format(m.value) : ""}
                </span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-teal-600 to-teal-400 transition-all"
                  style={{
                    height: `${(m.value / maxMonth) * 100}%`,
                    minHeight: m.value > 0 ? "8px" : "2px",
                    opacity: m.value > 0 ? 1 : 0.15,
                  }}
                  title={`${m.count} ventas`}
                />
                <span className="text-xs capitalize text-slate-500">{m.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Ganadas vs perdidas */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Resultado de negocios cerrados</h2>
          <p className="mb-6 text-xs text-slate-400">
            De cada negocio que llega a una decisión, ¿cuántos se ganan?
          </p>
          {closedCount === 0 ? (
            <p className="text-sm text-slate-400">Aún no hay negocios cerrados.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex h-8 w-full overflow-hidden rounded-lg">
                <div
                  className="flex items-center justify-center bg-emerald-500 text-xs font-bold text-white"
                  style={{ width: `${(wonDeals.length / closedCount) * 100}%` }}
                >
                  {wonDeals.length}
                </div>
                <div
                  className="flex items-center justify-center bg-red-400 text-xs font-bold text-white"
                  style={{ width: `${(lostDeals.length / closedCount) * 100}%` }}
                >
                  {lostDeals.length}
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-medium text-emerald-600">
                  ● Ganadas: {wonDeals.length} ({money.format(totalWonValue)})
                </span>
                <span className="font-medium text-red-500">
                  ● Perdidas: {lostDeals.length} (
                  {money.format(lostDeals.reduce((s, d) => s + d.amount, 0))})
                </span>
              </div>
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                💡 Además hay <strong>{openDeals.length} negocios abiertos</strong> en el pipeline
                por {money.format(openDeals.reduce((s, d) => s + d.amount, 0))} — el futuro de
                estas cifras.
              </p>
            </div>
          )}
        </section>

        {/* Origen de leads */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Origen de los leads</h2>
          <p className="mb-6 text-xs text-slate-400">
            De dónde llegan tus contactos y cuántos se vuelven clientes
          </p>
          <div className="space-y-3">
            {sources.map(([key, v]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-slate-600">
                  {sourceLabels[key] ?? key}
                </span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className="flex h-full items-center rounded-md bg-gradient-to-r from-blue-500 to-teal-500 px-2 text-xs font-semibold text-white"
                    style={{ width: `${Math.max((v.total / maxSource) * 100, 10)}%` }}
                  >
                    {v.total}
                  </div>
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-slate-500">
                  {v.clients > 0 ? `${v.clients} cliente${v.clients > 1 ? "s" : ""} 🎉` : "—"}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Embudo actual */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Embudo actual</h2>
          <p className="mb-6 text-xs text-slate-400">Negocios abiertos por etapa del pipeline</p>
          <div className="space-y-3">
            {stages.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm text-slate-600">{s.name}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className="flex h-full items-center rounded-md px-2 text-xs font-semibold text-white"
                    style={{
                      width: `${Math.max((s.deals.length / maxStage) * 100, s.deals.length > 0 ? 12 : 0)}%`,
                      backgroundColor: s.color,
                    }}
                  >
                    {s.deals.length > 0 && s.deals.length}
                  </div>
                </div>
                <span className="w-20 shrink-0 text-right text-xs font-medium text-slate-600">
                  {money.format(s.deals.reduce((x, d) => x + d.amount, 0))}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
