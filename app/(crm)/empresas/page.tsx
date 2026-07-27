import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { companyScope } from "@/lib/permissions";
import { ESTADOS_CLIENTE, estadoClienteLabels, estadoClienteClass } from "@/lib/clientes";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const { q, estado } = await searchParams;
  const query = q?.trim() ?? "";
  const estadoFiltro = (ESTADOS_CLIENTE as readonly string[]).includes(estado ?? "")
    ? estado!
    : "";
  const session = await getSession();
  const isSeller = session?.role === "vendedor";
  // El analista solo cuenta sus propios contactos/oportunidades dentro del cliente
  const ownContacts = isSeller ? { ownerId: session!.id } : {};
  const ownDeals = isSeller ? { ownerId: session!.id } : {};

  const companies = await prisma.company.findMany({
    where: {
      ...companyScope(session),
      ...(estadoFiltro ? { estadoCliente: estadoFiltro } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query } },
              { rif: { contains: query } },
              { industry: { contains: query } },
              { city: { contains: query } },
            ],
          }
        : {}),
    },
    include: {
      contacts: { where: ownContacts },
      deals: { where: { status: "open", ...ownDeals } },
      analista: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500">
            {companies.length} {companies.length === 1 ? "cliente" : "clientes"}
            {query && ` para "${query}"`}
            {estadoFiltro && ` · ${estadoClienteLabels[estadoFiltro]}`}
          </p>
        </div>
        <Link
          href="/empresas/nueva"
          className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          + Nuevo cliente
        </Link>
      </header>

      <form action="/empresas" className="flex flex-wrap gap-3">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Buscar por razón social, RIF, sector o ciudad…"
          className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        />
        <select
          name="estado"
          defaultValue={estadoFiltro}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        >
          <option value="">Todos los estados</option>
          {ESTADOS_CLIENTE.map((e) => (
            <option key={e} value={e}>
              {estadoClienteLabels[e]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          Filtrar
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {companies.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-400">
            {query || estadoFiltro
              ? "No se encontraron clientes con esos filtros."
              : "Aún no hay clientes registrados."}
          </p>
        )}
        {companies.map((co) => {
          const openValue = co.deals.reduce((s, d) => s + d.amount, 0);
          return (
            <Link
              key={co.id}
              href={`/empresas/${co.id}`}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-sm font-bold text-white">
                  {co.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold text-slate-800">{co.name}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        estadoClienteClass[co.estadoCliente] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {estadoClienteLabels[co.estadoCliente] ?? co.estadoCliente}
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {co.rif ?? "Sin RIF"}
                    {co.industry && ` · ${co.industry}`}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {co.analista ? `Analista: ${co.analista.name}` : "Sin analista asignado"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>
                  {co.contacts.length}{" "}
                  {co.contacts.length === 1 ? "contacto" : "contactos"}
                </span>
                <span>
                  {co.deals.length > 0 ? (
                    <>
                      {co.deals.length} abiertas ·{" "}
                      <span className="font-semibold text-teal-700">
                        {money.format(openValue)}
                      </span>
                    </>
                  ) : (
                    "Sin oportunidades"
                  )}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
