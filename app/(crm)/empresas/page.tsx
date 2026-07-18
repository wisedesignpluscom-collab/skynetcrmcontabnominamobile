import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { companyScope } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const session = await getSession();
  const isSeller = session?.role === "vendedor";
  // El vendedor solo cuenta sus propios contactos/oportunidades dentro de la empresa
  const ownContacts = isSeller ? { ownerId: session!.id } : {};
  const ownDeals = isSeller ? { ownerId: session!.id } : {};

  const companies = await prisma.company.findMany({
    where: {
      ...companyScope(session),
      ...(query
        ? {
            OR: [
              { name: { contains: query } },
              { industry: { contains: query } },
              { city: { contains: query } },
            ],
          }
        : {}),
    },
    include: {
      contacts: { where: ownContacts },
      deals: { where: { status: "open", ...ownDeals } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Empresas</h1>
          <p className="text-sm text-slate-500">
            {companies.length} {companies.length === 1 ? "empresa" : "empresas"}
            {query && ` para "${query}"`}
          </p>
        </div>
        <Link
          href="/empresas/nueva"
          className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          + Nueva empresa
        </Link>
      </header>

      <form action="/empresas" className="max-w-md">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre, sector o ciudad…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        />
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {companies.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-400">
            {query
              ? "No se encontraron empresas con esa búsqueda."
              : "Aún no hay empresas registradas."}
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
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{co.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {co.industry ?? "Sin sector"}
                    {co.city && ` · ${co.city}`}
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
