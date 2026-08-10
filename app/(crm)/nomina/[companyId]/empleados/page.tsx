import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { crearTrabajador } from "@/app/(crm)/empresas/trabajadores-actions";
import TrabajadorDetalle from "@/components/nomina/TrabajadorDetalle";

export const dynamic = "force-dynamic";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

// 2.2 — Gestionar empleados: fuente única de verdad del trabajador (extiende
// el roster de la Etapa 1, no lo reemplaza). Layout split sin JS de cliente:
// la selección y las tabs viajan por searchParams, igual que el resto del CRM.
export default async function EmpleadosPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string; tab?: string; id?: string; vista?: string }>;
}) {
  const { companyId } = await params;
  const { q, tab, id, vista } = await searchParams;
  const query = q?.trim() ?? "";
  const tabActiva = tab === "inactivos" ? "inactivos" : "activos";

  const todos = await prisma.trabajador.findMany({
    where: {
      companyId,
      ...(query
        ? {
            OR: [
              { nombre: { contains: query } },
              { cedula: { contains: query } },
              { cargo: { contains: query } },
            ],
          }
        : {}),
    },
    orderBy: { nombre: "asc" },
  });
  const activos = todos.filter((t) => t.activo);
  const inactivos = todos.filter((t) => !t.activo);
  const lista = tabActiva === "activos" ? activos : inactivos;

  const seleccionadoId = id && todos.some((t) => t.id === id) ? id : lista[0]?.id;
  const seleccionado = seleccionadoId
    ? await prisma.trabajador.findUnique({
        where: { id: seleccionadoId },
        include: {
          documentos: { orderBy: { createdAt: "desc" } },
          actividades: { orderBy: { createdAt: "desc" } },
        },
      })
    : null;

  const linkA = (extra: Record<string, string>) => {
    const usp = new URLSearchParams({ tab: tabActiva, ...(query ? { q: query } : {}), ...extra });
    return `/nomina/${companyId}/empleados?${usp.toString()}`;
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="space-y-4">
        <form action={crearTrabajador} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <input type="hidden" name="companyId" value={companyId} />
          <p className="text-sm font-semibold text-slate-800">Agregar empleado interno</p>
          <p className="text-xs text-slate-500">
            Solo nombre y cédula — para personal sin acceso a la plataforma.
          </p>
          <input name="cedula" placeholder="V-12345678" required className={`${inputClass} w-full`} />
          <input name="nombre" placeholder="Nombre y apellido" required className={`${inputClass} w-full`} />
          <button
            type="submit"
            className="w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            + Agregar
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex border-b border-slate-100">
            <Link
              href={linkA({ tab: "activos" })}
              className={`flex-1 px-3 py-2.5 text-center text-sm font-medium ${
                tabActiva === "activos" ? "border-b-2 border-teal-600 text-teal-700" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Activos ({activos.length})
            </Link>
            <Link
              href={linkA({ tab: "inactivos" })}
              className={`flex-1 px-3 py-2.5 text-center text-sm font-medium ${
                tabActiva === "inactivos" ? "border-b-2 border-teal-600 text-teal-700" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Inactivos ({inactivos.length})
            </Link>
          </div>

          <form action={`/nomina/${companyId}/empleados`} className="border-b border-slate-100 p-3">
            <input type="hidden" name="tab" value={tabActiva} />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Buscar por nombre, cédula o cargo…"
              className={`${inputClass} w-full`}
            />
          </form>

          <ul className="max-h-[60vh] overflow-y-auto">
            {lista.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-400">
                {query ? "Sin resultados para esa búsqueda." : "Nadie en esta pestaña todavía."}
              </li>
            )}
            {lista.map((t) => (
              <li key={t.id}>
                <Link
                  href={linkA({ id: t.id })}
                  className={`block border-b border-slate-50 px-4 py-3 text-sm transition-colors ${
                    t.id === seleccionadoId ? "bg-teal-50/60" : "hover:bg-slate-50"
                  }`}
                >
                  <p className="font-medium text-slate-800">{t.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {t.cedula}
                    {t.cargo && ` · ${t.cargo}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        {seleccionado ? (
          <TrabajadorDetalle
            companyId={companyId}
            trabajador={seleccionado}
            vista={vista}
            listQuery={{ tab: tabActiva, ...(query ? { q: query } : {}) }}
          />
        ) : (
          <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
            Elige un empleado de la lista para ver su ficha.
          </div>
        )}
      </div>
    </div>
  );
}
