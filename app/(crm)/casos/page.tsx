import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { canReassign, recurringCaseScope } from "@/lib/permissions";
import { periodoActual } from "@/lib/fiscal/data";
import { etiquetaPeriodo } from "@/lib/fiscal/vencimientos";
import {
  ESTADOS_CASO,
  ESTADO_VENCIDO,
  estadoCasoLabels,
  semaforoCaso,
  ultimoAvance,
  diasSinAvance,
  estaEstancado,
} from "@/lib/casos";
import { getUmbralEstancamiento } from "@/lib/casosSettings";
import CasoRow from "@/components/casos/CasoRow";
import SeguimientoAnalistas from "@/components/casos/SeguimientoAnalistas";
import { generarCasos } from "./actions";

export const dynamic = "force-dynamic";

const ESTADOS_FILTRO = [...ESTADOS_CASO, ESTADO_VENCIDO];

export default async function CasosPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string;
    estado?: string;
    analista?: string;
    ente?: string;
    estancado?: string;
    // Llega desde la línea de tiempo de servicios de la ficha del cliente
    // (components/clientes/LineaTiempoServicios.tsx) — no tiene chip propio
    // en la barra de filtros, solo se usa para llegar acá ya filtrado.
    empresa?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const filtros = await searchParams;
  const puedeGestionar = canReassign(session.role);
  const umbral = await getUmbralEstancamiento();

  const scope = recurringCaseScope(session);
  const where = {
    ...scope,
    ...(filtros.periodo ? { periodoFiscal: { startsWith: filtros.periodo } } : {}),
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.analista ? { analistaId: filtros.analista } : {}),
    ...(filtros.ente ? { obligacion: { enteReceptor: filtros.ente } } : {}),
    ...(filtros.empresa ? { companyId: filtros.empresa } : {}),
  };
  const empresaFiltro = filtros.empresa
    ? await prisma.company.findUnique({ where: { id: filtros.empresa }, select: { name: true } })
    : null;

  const [casos, usuarios, periodosRaw, entesRaw] = await Promise.all([
    prisma.casoRecurrente.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, rif: true } },
        obligacion: { select: { nombre: true, enteReceptor: true, periodicidad: true } },
        analista: { select: { name: true } },
        fases: {
          include: {
            obligacionFase: { select: { nombre: true, ayuda: true, order: true, active: true, campos: true } },
            completadaPor: { select: { name: true } },
          },
        },
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

  const hoy = new Date();
  // Seguimiento por analista (Etapa 3): última sub-fase completada, o la
  // apertura del caso si ninguna — así el supervisor ve si un caso lleva
  // muchos días sin que su analista avance nada, no solo si vence pronto.
  const seguimiento = casos.map((c) => {
    const ultima = ultimoAvance(
      c.createdAt,
      c.fases.filter((f) => f.estado === "completada").map((f) => f.completadaAt)
    );
    const dias = diasSinAvance(ultima, hoy);
    const faseActual = [...c.fases]
      .filter((f) => f.obligacionFase.active)
      .sort((a, b) => a.obligacionFase.order - b.obligacionFase.order)
      .find((f) => f.estado !== "completada");
    return {
      caso: c,
      semaforo: semaforoCaso(c.fechaLimite, c.estado, hoy),
      diasSinAvance: dias,
      estancado: estaEstancado(dias, c.estado, umbral),
      faseActualNombre: faseActual?.obligacionFase.nombre ?? null,
    };
  });
  const conSemaforo = filtros.estancado ? seguimiento.filter((s) => s.estancado) : seguimiento;
  const resumen = {
    vencidos: seguimiento.filter((c) => c.semaforo === "vencido").length,
    urgentes: seguimiento.filter((c) => c.semaforo === "hoy" || c.semaforo === "urgente").length,
    abiertos: casos.filter((c) => c.estado !== "presentado").length,
    presentados: casos.filter((c) => c.estado === "presentado").length,
    estancados: seguimiento.filter((c) => c.estancado).length,
  };

  // Solo para supervisión: casos abiertos agrupados por analista, con cuántos
  // están estancados. Reutiliza el mismo listado ya cargado (mismo límite de
  // 300 filas que el resto de la bandeja).
  const porAnalista = puedeGestionar
    ? usuarios
        .map((u) => {
          const suyos = seguimiento.filter((s) => s.caso.analistaId === u.id && s.caso.estado !== "presentado");
          return {
            id: u.id,
            nombre: u.name,
            abiertos: suyos.length,
            estancados: suyos.filter((s) => s.estancado).length,
          };
        })
        .filter((a) => a.abiertos > 0)
        .sort((a, b) => b.estancados - a.estancados || b.abiertos - a.abiertos)
    : [];

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
          {empresaFiltro && (
            <p className="mt-1 text-xs text-teal-700">
              Filtrando por <span className="font-semibold">{empresaFiltro.name}</span> ·{" "}
              <Link href={link({ empresa: undefined })} className="underline hover:text-teal-900">
                quitar filtro
              </Link>
            </p>
          )}
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

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
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
        <Link
          href={link({ estancado: filtros.estancado ? undefined : "1" })}
          className={`rounded-xl border p-4 text-left shadow-sm transition-colors hover:border-amber-300 ${
            filtros.estancado ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
          }`}
          title={`Sin avanzar ninguna sub-fase en ${umbral} días o más`}
        >
          <p className="text-xs uppercase tracking-wide text-slate-500">Estancados</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{resumen.estancados}</p>
        </Link>
      </section>

      {porAnalista.length > 0 && <SeguimientoAnalistas analistas={porAnalista} umbral={umbral} />}

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
          {conSemaforo.map(({ caso, semaforo, diasSinAvance, estancado, faseActualNombre }) => (
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
                fases: caso.fases.map((f) => ({
                  id: f.id,
                  estado: f.estado,
                  completadaAt: f.completadaAt,
                  completadaPorNombre: f.completadaPor?.name ?? null,
                  obligacionFase: f.obligacionFase,
                })),
              }}
              semaforo={semaforo}
              usuarios={usuarios}
              puedeReasignar={puedeGestionar}
              diasSinAvance={diasSinAvance}
              estancado={estancado}
              faseActualNombre={faseActualNombre}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
