import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { companyScope } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Home del módulo de Nómina: como cada cliente lleva su propio roster y
// configuración (Trabajador cuelga de Company desde la Etapa 1), el módulo
// global empieza aquí eligiendo PARA QUÉ cliente se va a trabajar antes de
// entrar a la sub-navegación (Nóminas / Vista empleado / Mi panel…).
export default async function NominaSelectorPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const session = await getSession();

  const companies = await prisma.company.findMany({
    where: {
      ...companyScope(session),
      ...(query
        ? { OR: [{ name: { contains: query } }, { rif: { contains: query } }] }
        : {}),
    },
    include: {
      trabajadores: { where: { activo: true }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Nómina</h1>
        <p className="text-sm text-slate-500">Elige el cliente cuya nómina vas a gestionar.</p>
      </header>

      <form action="/nomina" className="flex flex-wrap gap-3">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Buscar cliente por razón social o RIF…"
          className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          Buscar
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {companies.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-400">
            {query ? "No se encontraron clientes con ese criterio." : "Aún no hay clientes registrados."}
          </p>
        )}
        {companies.map((co) => (
          <Link
            key={co.id}
            href={`/nomina/${co.id}`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-sm font-bold text-white">
                {co.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800">{co.name}</p>
                <p className="truncate text-xs text-slate-500">{co.rif ?? "Sin RIF"}</p>
              </div>
            </div>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {co.trabajadores.length} {co.trabajadores.length === 1 ? "empleado activo" : "empleados activos"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
