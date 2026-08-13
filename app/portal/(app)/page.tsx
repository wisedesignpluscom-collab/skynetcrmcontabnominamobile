import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalUser, portalCompanyScope } from "@/lib/portal";
import {
  diasHasta,
  estadoCasoClass,
  estadoCasoLabels,
  semaforoCaso,
  semaforoClass,
  semaforoLabels,
} from "@/lib/casos";
import { estadoServicioClass, estadoServicioLabels } from "@/lib/planes";
import { estadoPlanLabels } from "@/lib/planes";
import { formatMonto } from "@/lib/clientes";
import { etiquetaPeriodo } from "@/lib/fiscal/vencimientos";
import { periodoActual } from "@/lib/fiscal/data";
import { colorObligacion, colorServicioIndividual, type ItemLineaServicio } from "@/lib/serviciosTimeline";
import LineaServiciosTimeline, {
  LeyendaLineaServicios,
} from "@/components/servicios/LineaServiciosTimeline";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });

// Cuánto falta (o cuánto se pasó), en palabras — mismo texto que ve el gestor
// en components/casos/CasoRow.tsx, para que ambos lados hablen igual.
function textoPlazo(fechaLimite: Date | null, estado: string): string {
  if (estado === "presentado") return "Cerrado";
  if (!fechaLimite) return "Sin fecha límite";
  const dias = diasHasta(fechaLimite);
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  if (dias > 0) return `Faltan ${dias} días`;
  return dias === -1 ? "Venció ayer" : `Venció hace ${Math.abs(dias)} días`;
}

export default async function PortalDashboardPage() {
  const auth = await requirePortalUser();
  if (auth.status === "anon" || auth.status === "blocked") redirect("/portal/login");
  if (auth.status === "must_change_password") redirect("/portal/cuenta");

  const scope = portalCompanyScope(auth.session);
  const hoy = new Date();

  const [company, casos, servicios, plan] = await Promise.all([
    prisma.company.findUnique({
      where: { id: auth.session.companyId },
      select: { name: true, analista: { select: { name: true } }, supervisor: { select: { name: true } } },
    }),
    prisma.casoRecurrente.findMany({
      where: scope,
      include: { obligacion: { select: { nombre: true, enteReceptor: true } } },
      orderBy: [{ fechaLimite: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.servicioIndividual.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.planServicio.findUnique({
      where: { companyId: auth.session.companyId },
      include: {
        obligaciones: {
          include: { obligacion: { select: { nombre: true, enteReceptor: true, periodicidad: true } } },
        },
      },
    }),
  ]);

  if (!company) redirect("/portal/login");

  // Línea de tiempo de servicios — mismo criterio que ve el gestor en la
  // ficha del cliente: culminado = caso del período en curso presentado; sin
  // caso todavía = sin comenzar. Una sola consulta acotada a las
  // obligacionId+periodo exactos que importan.
  const obligacionesDelPlan = plan?.obligaciones ?? [];
  const casosDelPeriodo = obligacionesDelPlan.length
    ? await prisma.casoRecurrente.findMany({
        where: {
          companyId: auth.session.companyId,
          OR: obligacionesDelPlan.map((po) => ({
            obligacionId: po.obligacionId,
            periodoFiscal: periodoActual(po.obligacion.periodicidad),
          })),
        },
        select: { obligacionId: true, estado: true },
      })
    : [];
  const estadoCasoPorObligacion = new Map(casosDelPeriodo.map((c) => [c.obligacionId, c.estado]));

  const lineaServicios: ItemLineaServicio[] = [
    ...obligacionesDelPlan.map((po): ItemLineaServicio => {
      const periodo = periodoActual(po.obligacion.periodicidad);
      return {
        id: `ob-${po.obligacionId}`,
        nombre: po.obligacion.nombre,
        detalle: `${po.obligacion.enteReceptor} · ${etiquetaPeriodo(periodo)}`,
        color: colorObligacion(estadoCasoPorObligacion.get(po.obligacionId)),
      };
    }),
    ...servicios.map((s): ItemLineaServicio => ({
      id: `sv-${s.id}`,
      nombre: s.tipo,
      detalle: s.descripcion || estadoServicioLabels[s.estado] || s.estado,
      color: colorServicioIndividual(s.estado),
    })),
  ];

  const conSemaforo = casos.map((c) => ({ caso: c, semaforo: semaforoCaso(c.fechaLimite, c.estado, hoy) }));
  const resumen = {
    vencidos: conSemaforo.filter((c) => c.semaforo === "vencido").length,
    urgentes: conSemaforo.filter((c) => c.semaforo === "hoy" || c.semaforo === "urgente").length,
    abiertos: casos.filter((c) => c.estado !== "presentado").length,
    presentados: casos.filter((c) => c.estado === "presentado").length,
  };
  const serviciosEnCurso = servicios.filter((s) => s.estado !== "facturado").length;

  // Barra de proporciones por estado (mismo espíritu que el embudo del
  // dashboard interno: divs con ancho % en vez de una librería de gráficos).
  const totalCasos = casos.length;
  const porEstado = ["pendiente_cliente", "en_proceso", "en_revision", "presentado"].map((estado) => ({
    estado,
    cantidad: casos.filter((c) => c.estado === estado).length,
  }));

  const gestor = company.analista?.name ?? company.supervisor?.name ?? null;

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30000} />

      <header className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-200">
          Portal de clientes
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Bienvenido, {company.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-indigo-100">
          Aquí puedes ver, en tiempo real, el estatus de tus obligaciones fiscales y servicios
          contratados con nosotros.
        </p>
      </header>

      {/* Línea de tiempo de servicios — mismo componente que ve tu gestor */}
      {lineaServicios.length > 0 && (
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 font-semibold text-slate-900">Línea de tiempo de servicios</h2>
          <LeyendaLineaServicios />
          <LineaServiciosTimeline items={lineaServicios} />
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "Gestiones abiertas", value: resumen.abiertos, accent: "bg-indigo-500" },
          { label: "Vencen pronto", value: resumen.urgentes, accent: "bg-amber-500" },
          { label: "Vencidas", value: resumen.vencidos, accent: "bg-red-500" },
          { label: "Servicios en curso", value: serviciosEnCurso, accent: "bg-teal-500" },
        ].map((kpi) => (
          <div key={kpi.label} className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <span className={`absolute inset-y-0 left-0 w-1 ${kpi.accent}`} />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{kpi.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 xl:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-900">Tus obligaciones fiscales</h2>

          {totalCasos > 0 && (
            <div className="mb-5 space-y-1.5">
              {porEstado.map((p) => (
                <div key={p.estado} className="flex items-center gap-3 text-xs">
                  <span className="w-32 shrink-0 text-slate-500">{estadoCasoLabels[p.estado]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${estadoCasoClass[p.estado]?.split(" ")[0] ?? "bg-slate-300"}`}
                      style={{ width: totalCasos ? `${(p.cantidad / totalCasos) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right font-semibold text-slate-700">{p.cantidad}</span>
                </div>
              ))}
            </div>
          )}

          {conSemaforo.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
              No hay obligaciones registradas todavía.
            </p>
          ) : (
            <ul className="space-y-2">
              {conSemaforo.map(({ caso, semaforo }) => (
                <li
                  key={caso.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3"
                >
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${semaforoClass[semaforo]}`}
                    title={semaforoLabels[semaforo]}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {caso.obligacion.nombre}
                      <span className="font-normal text-slate-400"> · {caso.obligacion.enteReceptor}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">{etiquetaPeriodo(caso.periodoFiscal)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-700">
                      {caso.fechaLimite ? fechaCorta(caso.fechaLimite) : "—"}
                    </p>
                    <p className="text-xs text-slate-400">{textoPlazo(caso.fechaLimite, caso.estado)}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      estadoCasoClass[caso.estado] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {estadoCasoLabels[caso.estado] ?? caso.estado}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold text-slate-900">Tu gestor asignado</h2>
            {gestor ? (
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 text-sm font-bold text-white">
                  {gestor[0]?.toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{gestor}</p>
                  <p className="text-xs text-slate-500">Tu contacto en la firma</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Aún no tienes un gestor asignado.</p>
            )}
          </section>

          {plan && (
            <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-3 font-semibold text-slate-900">Tu plan contratado</h2>
              <p className="text-2xl font-bold text-slate-900">
                {formatMonto(plan.honorarioMensual, plan.moneda)}
                <span className="text-sm font-normal text-slate-400"> /mes</span>
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {estadoPlanLabels[plan.estado] ?? plan.estado}
              </p>
              {plan.obligaciones.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                  {plan.obligaciones.map((po) => (
                    <li key={po.id} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                      {po.obligacion.nombre}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {servicios.length > 0 && (
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 font-semibold text-slate-900">Servicios y trabajos puntuales</h2>
          <ul className="space-y-2">
            {servicios.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{s.tipo}</p>
                  {s.descripcion && <p className="truncate text-xs text-slate-500">{s.descripcion}</p>}
                </div>
                <span className="text-sm font-semibold text-slate-700">
                  {formatMonto(s.montoCotizado, s.moneda)}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    estadoServicioClass[s.estado] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {estadoServicioLabels[s.estado] ?? s.estado}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
