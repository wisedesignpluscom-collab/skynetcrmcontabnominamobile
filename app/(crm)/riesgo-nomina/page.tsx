// Bandeja de riesgo de nómina — Workflow Engine + Rule Engine (Etapa 1,
// incremento 5): vista transversal a las ~200 empresas para que gerencia y
// supervisión no tengan que abrir cliente por cliente para ver quién quedó
// bloqueado por subdeclaración del FAO. Mismo patrón que /casos.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { canApprove, nominaRiesgoScope } from "@/lib/permissions";
import { periodoActual } from "@/lib/fiscal/data";
import { etiquetaPeriodo } from "@/lib/fiscal/vencimientos";
import {
  ESTADOS_DECLARACION,
  ESTADO_BLOQUEADA,
  estadoDeclaracionLabels,
  motivoRiesgoLabels,
} from "@/lib/nomina";
import { formatMulti } from "@/lib/multivalor";
import DeclaracionRiesgoRow from "@/components/nomina/DeclaracionRiesgoRow";

export const dynamic = "force-dynamic";

const ESTADOS_FILTRO = [...ESTADOS_DECLARACION, ESTADO_BLOQUEADA];

export default async function RiesgoNominaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; estado?: string; riesgo?: string; analista?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const filtros = await searchParams;
  const puedeAprobar = canApprove(session.role);
  const periodoDefecto = periodoActual("mensual");

  const scope = nominaRiesgoScope(session);
  const where = {
    ...scope,
    periodo: filtros.periodo || periodoDefecto,
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.riesgo === "si" ? { riesgo: true } : {}),
    ...(filtros.riesgo === "no" ? { riesgo: false } : {}),
    ...(filtros.analista ? { trabajador: { company: { analistaId: filtros.analista } } } : {}),
  };

  const [declaraciones, usuarios, periodosRaw] = await Promise.all([
    prisma.declaracionNomina.findMany({
      where,
      include: {
        trabajador: {
          include: { company: { select: { id: true, name: true, analista: { select: { name: true } } } } },
        },
      },
      orderBy: [{ riesgo: "desc" }, { estado: "asc" }],
      take: 500,
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.declaracionNomina.findMany({
      where: scope,
      distinct: ["periodo"],
      select: { periodo: true },
      orderBy: { periodo: "desc" },
      take: 12,
    }),
  ]);

  const periodos = periodosRaw.map((p) => p.periodo);
  if (!periodos.includes(periodoDefecto)) periodos.unshift(periodoDefecto);

  const resumen = {
    enRiesgo: declaraciones.filter((d) => d.riesgo).length,
    bloqueadas: declaraciones.filter((d) => d.estado === ESTADO_BLOQUEADA).length,
    pendientesAprobar: declaraciones.filter((d) => d.estado === "en_revision" && !d.riesgo).length,
    aprobadas: declaraciones.filter((d) => d.estado === "aprobada").length,
  };

  const link = (cambio: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...filtros, ...cambio };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/riesgo-nomina?${qs}` : "/riesgo-nomina";
  };

  const chip = (activo: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      activo ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  const periodoMostrado = filtros.periodo || periodoDefecto;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Riesgo de nómina</h1>
        <p className="text-sm text-slate-500">
          Base declarada por trabajador y período, con la detección de riesgo de subdeclaración del
          FAO (Rule Engine) y su bloqueo supervisorio (Workflow Engine).
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "En riesgo", value: resumen.enRiesgo, className: "text-red-600" },
          { label: "Bloqueadas", value: resumen.bloqueadas, className: "text-red-600" },
          { label: "Listas para aprobar", value: resumen.pendientesAprobar, className: "text-amber-600" },
          { label: "Aprobadas", value: resumen.aprobadas, className: "text-emerald-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={`mt-1 text-xl font-bold ${k.className}`}>{k.value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Período</span>
          {periodos.map((p) => (
            <Link key={p} href={link({ periodo: p === periodoDefecto ? undefined : p })} className={chip(periodoMostrado === p)}>
              {etiquetaPeriodo(p)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estado</span>
          <Link href={link({ estado: undefined })} className={chip(!filtros.estado)}>
            Todos
          </Link>
          {ESTADOS_FILTRO.map((e) => (
            <Link key={e} href={link({ estado: e })} className={chip(filtros.estado === e)}>
              {estadoDeclaracionLabels[e]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Riesgo</span>
          <Link href={link({ riesgo: undefined })} className={chip(!filtros.riesgo)}>
            Todos
          </Link>
          <Link href={link({ riesgo: "si" })} className={chip(filtros.riesgo === "si")}>
            Solo en riesgo
          </Link>
          <Link href={link({ riesgo: "no" })} className={chip(filtros.riesgo === "no")}>
            Sin riesgo
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Analista</span>
          <Link href={link({ analista: undefined })} className={chip(!filtros.analista)}>
            Todos
          </Link>
          {usuarios.map((u) => (
            <Link key={u.id} href={link({ analista: u.id })} className={chip(filtros.analista === u.id)}>
              {u.name}
            </Link>
          ))}
        </div>
      </section>

      {declaraciones.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            Sin declaraciones con estos filtros. Se cargan desde la ficha de cada cliente, en su
            sección «Trabajadores».
          </p>
        </section>
      ) : (
        <ul className="space-y-2">
          {declaraciones.map((d) => (
            <DeclaracionRiesgoRow
              key={d.id}
              companyId={d.trabajador.company.id}
              companyName={d.trabajador.company.name}
              analistaNombre={d.trabajador.company.analista?.name ?? null}
              trabajadorId={d.trabajadorId}
              trabajadorNombre={d.trabajador.nombre}
              trabajadorCedula={d.trabajador.cedula}
              periodo={d.periodo}
              baseDeclarada={d.baseDeclarada}
              estado={d.estado}
              riesgo={d.riesgo}
              motivos={formatMulti(d.motivoRiesgo, "").split(", ").filter(Boolean).map((m) => motivoRiesgoLabels[m] ?? m)}
              notaRiesgo={d.notaRiesgo}
              puedeAprobar={puedeAprobar}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
