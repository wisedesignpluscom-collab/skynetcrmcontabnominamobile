import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCompany } from "../actions";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function EmpresaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  const [company, allStages] = await Promise.all([
    prisma.company.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { firstName: "asc" } },
        deals: { include: { stage: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.pipelineStage.findMany({ orderBy: { order: "asc" } }),
  ]);

  if (!company) notFound();

  const openStages = allStages.filter((s) => s.type === "open");

  const infoRows = [
    { label: "Sector", value: company.industry },
    { label: "Sitio web", value: company.website },
    { label: "Teléfono", value: company.phone },
    { label: "Ciudad", value: company.city },
    { label: "Dirección", value: company.address },
  ];

  const openDeals = company.deals.filter((d) => d.status === "open");
  const openValue = openDeals.reduce((s, d) => s + d.amount, 0);
  const wonValue = company.deals
    .filter((d) => d.status === "won")
    .reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/empresas" className="text-sm font-medium text-teal-600 hover:underline">
            ← Volver a empresas
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-base font-bold text-white">
              {company.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{company.name}</h1>
              <p className="text-sm text-slate-500">
                {company.industry ?? "Sin sector"}
                {company.city && ` · ${company.city}`}
              </p>
            </div>
          </div>
        </div>
        {canDelete(session?.role) && (
          <form action={deleteCompany}>
            <input type="hidden" name="companyId" value={company.id} />
            <button
              type="submit"
              title="Eliminar empresa (los contactos quedan sin empresa, no se borran)"
              className="rounded-lg border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
            >
              Eliminar
            </button>
          </form>
        )}
      </header>

      {/* Línea de tiempo de oportunidades en el pipeline */}
      {company.deals.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 font-semibold text-slate-900">Línea de tiempo en el pipeline</h2>
          <p className="mb-5 text-xs text-slate-400">
            En qué etapa va cada oportunidad de esta empresa.
          </p>
          <div className="space-y-6">
            {company.deals.map((deal) => {
              const currentIdx =
                deal.status === "open"
                  ? openStages.findIndex((s) => s.id === deal.stageId)
                  : openStages.length;
              const closed = deal.status !== "open";
              return (
                <div key={deal.id}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Link
                      href={`/pipeline/${deal.id}`}
                      className="truncate text-sm font-medium text-slate-800 hover:text-teal-700 hover:underline"
                    >
                      {deal.title}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700">
                        {money.format(deal.amount)}
                      </span>
                      {deal.status === "won" && (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          ✓ Ganada
                        </span>
                      )}
                      {deal.status === "lost" && (
                        <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                          ✕ Perdida
                        </span>
                      )}
                      {deal.pendingAction && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          ⏳ En aprobación
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex">
                    {openStages.map((s, i) => {
                      const reached = i <= currentIdx;
                      const isCurrent = !closed && i === currentIdx;
                      const dim = deal.status === "lost";
                      return (
                        <div key={s.id} className="relative flex flex-1 flex-col items-center">
                          {i > 0 && (
                            <span
                              className="absolute left-0 right-1/2 top-[7px] h-0.5"
                              style={{
                                backgroundColor:
                                  i <= currentIdx ? (dim ? "#cbd5e1" : s.color) : "#e2e8f0",
                              }}
                            />
                          )}
                          {i < openStages.length - 1 && (
                            <span
                              className="absolute left-1/2 right-0 top-[7px] h-0.5"
                              style={{
                                backgroundColor:
                                  i < currentIdx ? (dim ? "#cbd5e1" : s.color) : "#e2e8f0",
                              }}
                            />
                          )}
                          <span
                            className="relative z-10 h-4 w-4 rounded-full border-2"
                            style={{
                              backgroundColor: reached
                                ? dim
                                  ? "#cbd5e1"
                                  : s.color
                                : "#ffffff",
                              borderColor: reached
                                ? dim
                                  ? "#cbd5e1"
                                  : s.color
                                : "#cbd5e1",
                              ...(isCurrent
                                ? { boxShadow: `0 0 0 4px ${s.color}33` }
                                : {}),
                            }}
                          />
                          <span
                            className={`mt-1.5 text-center text-[10px] leading-tight ${
                              isCurrent ? "font-semibold text-slate-800" : "text-slate-400"
                            }`}
                          >
                            {s.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Resumen */}
      <section className="grid grid-cols-3 gap-4 max-w-2xl">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Contactos</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{company.contacts.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pipeline abierto</p>
          <p className="mt-1 text-xl font-bold text-teal-700">{money.format(openValue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ventas ganadas</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{money.format(wonValue)}</p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Información */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">Información</h2>
          <dl className="space-y-3 text-sm">
            {infoRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-4">
                <dt className="text-slate-500">{row.label}</dt>
                <dd className="text-right font-medium text-slate-800">{row.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {company.notes && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              {company.notes}
            </p>
          )}
        </section>

        {/* Contactos */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">
            Contactos ({company.contacts.length})
          </h2>
          {company.contacts.length === 0 ? (
            <p className="text-sm text-slate-400">Sin contactos vinculados.</p>
          ) : (
            <ul className="space-y-3">
              {company.contacts.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/contactos/${c.id}`}
                    className="flex items-center gap-2.5 rounded-lg p-2 -m-2 transition-colors hover:bg-teal-50/60"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-blue-600 text-xs font-bold text-white">
                      {c.firstName[0]}
                      {c.lastName[0]}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {c.position ?? c.email ?? "—"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Oportunidades */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">
            Oportunidades ({company.deals.length})
          </h2>
          {company.deals.length === 0 ? (
            <p className="text-sm text-slate-400">Sin oportunidades registradas.</p>
          ) : (
            <ul className="space-y-3">
              {company.deals.map((d) => (
                <li key={d.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-800">{d.title}</p>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span
                      className="rounded-full px-2 py-0.5 font-medium text-white"
                      style={{ backgroundColor: d.stage.color }}
                    >
                      {d.stage.name}
                    </span>
                    <span className="font-semibold text-slate-700">{money.format(d.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
