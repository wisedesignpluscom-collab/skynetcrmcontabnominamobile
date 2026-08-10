import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { monedaLabels } from "@/lib/clientes";

export const dynamic = "force-dynamic";

// Las 8 tarjetas de acceso directo de la Home — todas construidas (2.1-2.7).
// `built` queda como bandera por si un módulo futuro necesita el estado
// "Próximamente" de nuevo, sin cambiar la estructura de la lista.
const MODULOS: {
  label: string;
  descripcion: string;
  href: string;
  color: string;
  built: boolean;
  icon: React.ReactNode;
}[] = [
  {
    label: "Gestionar empleados",
    descripcion: "Alta, ficha y ciclo de vida del trabajador",
    href: "empleados",
    color: "from-teal-400 to-teal-600",
    built: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" strokeLinecap="round" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M16 15.2c2.4.2 4.6 1.7 5.3 4.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Operación de Nómina",
    descripcion: "Asistencia, corrida del período y exportación a Galac",
    href: "operacion",
    color: "from-amber-400 to-amber-600",
    built: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9h10M7 13h6M7 17h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Vacaciones",
    descripcion: "Días tomados, pendientes y bono vacacional",
    href: "vacaciones",
    color: "from-cyan-400 to-cyan-600",
    built: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5M12 3.5c-2.4 2.4-3.5 5.3-3.5 8.5s1.1 6.1 3.5 8.5M4 12h16" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Utilidades",
    descripcion: "Cálculo y distribución anual de utilidades",
    href: "utilidades",
    color: "from-violet-400 to-violet-600",
    built: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path d="M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 3 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Liquidaciones",
    descripcion: "Prestaciones sociales al egreso, según LOTTT",
    href: "liquidaciones",
    color: "from-rose-400 to-rose-600",
    built: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" strokeLinejoin="round" />
        <path d="M9 13l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Reportes",
    descripcion: "Costo por corrida, asistencia y cuentas por pagar",
    href: "reportes",
    color: "from-slate-500 to-slate-700",
    built: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path d="M4 19V10M10 19V4M16 19v-8" strokeLinecap="round" />
        <path d="M3 21h18" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Ubicaciones",
    descripcion: "Geocercas para marcaje de asistencia",
    href: "ubicaciones",
    color: "from-emerald-400 to-emerald-600",
    built: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path d="M12 21s-7-5.1-7-11a7 7 0 0 1 14 0c0 5.9-7 11-7 11z" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    label: "Configuración",
    descripcion: "País, jornadas, conceptos, cuentas y parámetros legales",
    href: "configuracion",
    color: "from-blue-400 to-blue-600",
    built: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.7-1.6L13.4 2h-3l-.4 2.9a7 7 0 0 0-2.7 1.6l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .5.1 1.1.2 1.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.7 1.6l.4 2.9h3l.4-2.9a7 7 0 0 0 2.7-1.6l2.3 1 2-3.4-2-1.5c.1-.5.2-1 .2-1.6z" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default async function NominaHomePage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      moneda: true,
      trabajadores: { where: { activo: true }, select: { id: true } },
    },
  });
  if (!company) notFound();

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">
              {company.name}
            </p>
            <h1 className="mt-1 text-2xl font-bold">Nómina · Venezuela</h1>
            <p className="mt-1 text-sm text-slate-300">Marco legal: LOTTT</p>
          </div>
          <button
            type="button"
            disabled
            title="Próximamente"
            className="cursor-not-allowed rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white/60"
          >
            Asistente de configuración
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-6 border-t border-white/10 pt-4">
          <div>
            <p className="text-2xl font-bold">{company.trabajadores.length}</p>
            <p className="text-xs text-slate-400">
              {company.trabajadores.length === 1 ? "empleado activo" : "empleados activos"}
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold">{monedaLabels[company.moneda] ?? company.moneda}</p>
            <p className="text-xs text-slate-400">Moneda base</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MODULOS.map((m) => {
          const card = (
            <div
              className={`h-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all ${
                m.built ? "hover:-translate-y-0.5 hover:shadow-md" : "opacity-60"
              }`}
            >
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br text-white ${m.color}`}
              >
                {m.icon}
              </div>
              <p className="mt-3 font-semibold text-slate-800">{m.label}</p>
              <p className="mt-1 text-xs text-slate-500">{m.descripcion}</p>
              {!m.built && (
                <span className="mt-3 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  Próximamente
                </span>
              )}
            </div>
          );
          return m.built ? (
            <Link key={m.href} href={`/nomina/${companyId}/${m.href}`}>
              {card}
            </Link>
          ) : (
            <div key={m.href} title="Próximamente" className="cursor-not-allowed">
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}
