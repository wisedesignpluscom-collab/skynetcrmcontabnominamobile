import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { canReassign, recurringCaseScope } from "@/lib/permissions";
import { periodoActual } from "@/lib/fiscal/data";
import { etiquetaPeriodo } from "@/lib/fiscal/vencimientos";
import { ESTADOS_CASO, ESTADO_VENCIDO, estadoCasoLabels, semaforoCaso } from "@/lib/casos";
import { ensamblarFases } from "@/lib/fases";
import type { FaseTimelineItem } from "@/components/casos/CasoFaseTimeline";
import CasoRow from "@/components/casos/CasoRow";
import { generarCasos } from "./actions";

export const dynamic = "force-dynamic";

const ESTADOS_FILTRO = [...ESTADOS_CASO, ESTADO_VENCIDO];

export default async function CasosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; estado?: string; analista?: string; ente?: string; faseError?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const filtros = await searchParams;
  const puedeGestionar = canReassign(session.role);

  const scope = recurringCaseScope(session);
  const where = {
    ...scope,
    ...(filtros.periodo ? { periodoFiscal: { startsWith: filtros.periodo } } : {}),
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.analista ? { analistaId: filtros.analista } : {}),
    ...(filtros.ente ? { obligacion: { enteReceptor: filtros.ente } } : {}),
  };

  const [casos, usuarios, periodosRaw, entesRaw] = await Promise.all([
    prisma.casoRecurrente.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, rif: true } },
        obligacion: { select: { nombre: true, enteReceptor: true, periodicidad: true } },
        analista: { select: { name: true } },
      },
      orderBy: [{ fechaLimite: "asc" }, { createdAt: "desc" }],
      take: 300,
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.casoRecurrente.findMany({
      where: scope,
      distinct: ["periodoFiscal"],
      select: { periodoFiscal: true },
      orderBy: { periodoFiscal: "desc" },
      take: 24,
    }),
    prisma.obligacion.findMany({ distinct: ["enteReceptor"], select: { enteReceptor: true } }),
  ]);

  // Meses distintos (una quincena y su mes son el mismo filtro)
  const periodos = [...new Set(periodosRaw.map((p) => p.periodoFiscal.slice(0, 7)))].sort().reverse();

  // Checklist de fases por caso, en lote (no una consulta por fila): plantilla
  // por obligación + progreso de estos casos, ensamblados en memoria.
  const obligacionIds = [...new Set(casos.map((c) => c.obligacionId))];
  const casoIds = casos.map((c) => c.id);
  const [plantillas, progresos] = await Promise.all([
    obligacionIds.length
      ? prisma.faseObligacion.findMany({ where: { obligacionId: { in: obligacionIds } }, orderBy: { order: "asc" } })
      : Promise.resolve([]),
    casoIds.length
      ? prisma.casoFaseProgreso.findMany({
          where: { casoId: { in: casoIds } },
          include: { completedBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const fasesPorObligacion = new Map<string, typeof plantillas>();
  for (const f of plantillas) {
    fasesPorObligacion.set(f.obligacionId, [...(fasesPorObligacion.get(f.obligacionId) ?? []), f]);
  }
  const progresoPorCaso = new Map<string, typeof progresos>();
  for (const p of progresos) {
    progresoPorCaso.set(p.casoId, [...(progresoPorCaso.get(p.casoId) ?? []), p]);
  }
  const fasesDeCaso = (casoId: string, obligacionId: string): FaseTimelineItem[] =>
    ensamblarFases(fasesPorObligacion.get(obligacionId) ?? [], progresoPorCaso.get(casoId) ?? []);

  const hoy = new Date();
  const conSemaforo = casos.map((c) => ({ caso: c, semaforo: semaforoCaso(c.fechaLimite, c.estado, hoy) }));
  const resumen = {
    vencidos: conSemaforo.filter((c) => c.semaforo === "vencido").length,
    urgentes: conSemaforo.filter((c) => c.semaforo === "hoy" || c.semaforo === "urgente").length,
    abiertos: casos.filter((c) => c.estado !== "presentado").length,
    presentados: casos.filter((c) => c.estado === "presentado").length,
  };

  const link = (cambio: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...filtros, ...cambio };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/casos?${qs}` : "/casos";
  };

  const chip = (activo: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      activo ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Casos del período</h1>
          <p className="text-sm text-slate-500">
            Cada obligación de cada cliente en su período fiscal. Al presentar uno, el sistema abre
            el del período siguiente con su fecha ya calculada.
          </p>
        </div>
        {puedeGestionar && (
          <form action={generarCasos}>
            <button
              type="submit"
              title={`Abre los casos de ${etiquetaPeriodo(periodoActual("mensual", hoy))} de los planes activos`}
              className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
            >
              Abrir casos del período
            </button>
          </form>
        )}
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Vencidos", value: resumen.vencidos, className: "text-red-600" },
          { label: "Vencen ya", value: resumen.urgentes, className: "text-amber-600" },
          { label: "Abiertos", value: resumen.abiertos, className: "text-slate-900" },
          { label: "Presentados", value: resumen.presentados, className: "text-emerald-600" },
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
          <Link href={link({ periodo: undefined })} className={chip(!filtros.periodo)}>
            Todos
          </Link>
          {periodos.map((p) => (
            <Link key={p} href={link({ periodo: p })} className={chip(filtros.periodo === p)}>
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
              {estadoCasoLabels[e]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ente</span>
          <Link href={link({ ente: undefined })} className={chip(!filtros.ente)}>
            Todos
          </Link>
          {entesRaw.map((e) => (
            <Link key={e.enteReceptor} href={link({ ente: e.enteReceptor })} className={chip(filtros.ente === e.enteReceptor)}>
              {e.enteReceptor}
            </Link>
          ))}
        </div>
        {puedeGestionar && (
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
        )}
      </section>

      {filtros.faseError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{filtros.faseError}</p>
      )}

      {conSemaforo.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No hay casos con estos filtros.
            {puedeGestionar &&
              " Si los clientes ya tienen su plan de servicios, usa «Abrir casos del período»."}
          </p>
        </section>
      ) : (
        <ul className="space-y-2">
          {conSemaforo.map(({ caso, semaforo }) => (
            <CasoRow
              key={caso.id}
              caso={{
                id: caso.id,
                periodoFiscal: caso.periodoFiscal,
                estado: caso.estado,
                fechaLimite: caso.fechaLimite,
                fechaSolicitudSoportes: caso.fechaSolicitudSoportes,
                fechaPresentacion: caso.fechaPresentacion,
                evidenciaUrl: caso.evidenciaUrl,
                causaAtraso: caso.causaAtraso,
                notas: caso.notas,
                analistaId: caso.analistaId,
                supervisorId: caso.supervisorId,
                analistaNombre: caso.analista?.name ?? null,
                companyId: caso.company.id,
                companyName: caso.company.name,
                obligacionNombre: caso.obligacion.nombre,
                enteReceptor: caso.obligacion.enteReceptor,
              }}
              semaforo={semaforo}
              usuarios={usuarios}
              puedeReasignar={puedeGestionar}
              fases={fasesDeCaso(caso.id, caso.obligacionId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
