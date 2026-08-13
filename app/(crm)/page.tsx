import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { iconFor } from "@/lib/catalog";
import { getSession, type SessionUser } from "@/lib/session";
import { taskScope, companyScope, recurringCaseScope } from "@/lib/permissions";
import { noLeidosPorStaffWhere } from "@/lib/chat";
import { semaforoCaso, semaforoClass, semaforoLabels, type Semaforo } from "@/lib/casos";
import { estadoClienteLabels } from "@/lib/clientes";
import { porCobrar, formatTotales } from "@/lib/facturacion";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
});

const legacyTypeLabels: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  reunion: "Reunión",
  seguimiento: "Seguimiento",
  nota: "Nota",
  otro: "Otro",
};

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function SemaforoResumen({ casos }: { casos: { estado: string; fechaLimite: Date | null }[] }) {
  const counts: Record<Semaforo, number> = {
    presentado: 0,
    vencido: 0,
    hoy: 0,
    urgente: 0,
    proximo: 0,
    tranquilo: 0,
    sin_fecha: 0,
  };
  for (const c of casos) counts[semaforoCaso(c.fechaLimite, c.estado)]++;
  const orden: Semaforo[] = ["vencido", "hoy", "urgente", "proximo", "tranquilo", "sin_fecha"];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {orden.map((s) => (
        <div key={s} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center">
          <span className={`mx-auto mb-1 block h-2 w-2 rounded-full ${semaforoClass[s]}`} />
          <span className="block text-lg font-bold text-slate-800">{counts[s]}</span>
          <span className="block text-[10px] leading-tight text-slate-500">{semaforoLabels[s]}</span>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  if (session?.role === "admin") return <GerenteDashboard />;
  if (session?.role === "supervisor") return <SupervisorDashboard session={session} />;
  return <AnalistaDashboard session={session} />;
}

// ── Gerente ──────────────────────────────────────────────────────────────────
// Lo que un gerente necesita ver de un vistazo: la fuerza laboral que la firma
// gestiona (trabajadores activos de todos los clientes), el estado de la
// cartera de clientes, cómo va el loop mensual de obligaciones en general, la
// cobranza pendiente y el riesgo de nómina sin resolver.
async function GerenteDashboard() {
  const [
    trabajadoresActivos,
    trabajadoresInactivos,
    empresasPorEstado,
    casosAbiertos,
    facturasPendientes,
    riesgoPendiente,
    empresasConTrabajadores,
  ] = await Promise.all([
    prisma.trabajador.count({ where: { activo: true } }),
    prisma.trabajador.count({ where: { activo: false } }),
    prisma.company.groupBy({ by: ["estadoCliente"], _count: { _all: true } }),
    prisma.casoRecurrente.findMany({
      where: { estado: { not: "presentado" } },
      select: { estado: true, fechaLimite: true },
    }),
    prisma.facturacion.findMany({
      where: { estadoPago: { not: "pagado" } },
      select: { monto: true, moneda: true, estadoPago: true },
    }),
    prisma.declaracionNomina.count({ where: { riesgo: true, estado: { not: "aprobada" } } }),
    prisma.company.findMany({
      where: { estadoCliente: "activo" },
      select: {
        id: true,
        name: true,
        _count: { select: { trabajadores: { where: { activo: true } } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const estadoCounts: Record<string, number> = {};
  for (const g of empresasPorEstado) estadoCounts[g.estadoCliente] = g._count._all;
  const totalEmpresas = Object.values(estadoCounts).reduce((a, b) => a + b, 0);
  const casosVencidos = casosAbiertos.filter((c) => semaforoCaso(c.fechaLimite, c.estado) === "vencido").length;
  const porCobrarTotales = porCobrar(facturasPendientes);

  const kpis = [
    {
      label: "Trabajadores activos",
      value: String(trabajadoresActivos),
      sub: `${trabajadoresInactivos} de baja`,
      accent: "bg-teal-500",
    },
    {
      label: "Clientes activos",
      value: String(estadoCounts.activo ?? 0),
      sub: `${totalEmpresas} clientes en total`,
      accent: "bg-blue-500",
    },
    {
      label: "Casos vencidos",
      value: String(casosVencidos),
      sub: `${casosAbiertos.length} casos abiertos en total`,
      accent: "bg-red-500",
    },
    {
      label: "Por cobrar",
      value: formatTotales(porCobrarTotales),
      sub: "facturación pendiente o vencida",
      accent: "bg-amber-500",
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Vista general de la firma — clientes, trabajadores y obligaciones.</p>
      </header>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Kpi key={k.label} {...k} />
        ))}
      </section>

      {riesgoPendiente > 0 && (
        <Link
          href="/riesgo-nomina"
          className="flex items-center justify-between gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-4 shadow-sm transition hover:bg-red-100"
        >
          <p className="text-sm font-semibold text-red-800">
            ⚠ {riesgoPendiente === 1 ? "1 declaración" : `${riesgoPendiente} declaraciones`} de nómina en riesgo sin resolver
          </p>
          <span className="shrink-0 text-sm font-semibold text-red-700">Revisar →</span>
        </Link>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Estatus de casos (todos los clientes)</h2>
            <Link href="/casos" className="text-sm font-medium text-teal-600 hover:underline">
              Ver todos →
            </Link>
          </div>
          <SemaforoResumen casos={casosAbiertos} />
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Estatus de clientes</h2>
            <Link href="/empresas" className="text-sm font-medium text-teal-600 hover:underline">
              Ver todos →
            </Link>
          </div>
          <ul className="space-y-2">
            {Object.entries(estadoClienteLabels).map(([key, label]) => (
              <li key={key} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{label}</span>
                <span className="font-semibold text-slate-800">{estadoCounts[key] ?? 0}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Trabajadores activos por cliente</h2>
          <Link href="/nomina" className="text-sm font-medium text-teal-600 hover:underline">
            Ir a nómina →
          </Link>
        </div>
        {empresasConTrabajadores.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay clientes activos.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {empresasConTrabajadores.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/nomina/${e.id}/empleados`}
                  className="flex items-center justify-between py-2.5 hover:bg-slate-50"
                >
                  <span className="text-sm text-slate-700">{e.name}</span>
                  <span className="text-sm font-semibold text-slate-800">
                    {e._count.trabajadores} trabajador{e._count.trabajadores === 1 ? "" : "es"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Supervisor ───────────────────────────────────────────────────────────────
// Lo que un supervisor necesita para evaluar el proceso de sus clientes y sus
// analistas: cómo va cada cuenta que supervisa, qué se le fue de fecha, y qué
// declaraciones de nómina en riesgo están esperando su revisión.
async function SupervisorDashboard({ session }: { session: SessionUser }) {
  const misEmpresas = { supervisorId: session.id };

  const [empresas, casos, riesgoEnRevision, mensajesSinLeer] = await Promise.all([
    prisma.company.findMany({
      where: misEmpresas,
      select: { id: true, name: true, estadoCliente: true, analista: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.casoRecurrente.findMany({
      where: { estado: { not: "presentado" }, company: misEmpresas },
      select: {
        id: true,
        estado: true,
        fechaLimite: true,
        company: { select: { id: true, name: true } },
        obligacion: { select: { nombre: true } },
      },
    }),
    prisma.declaracionNomina.findMany({
      where: { riesgo: true, estado: "en_revision", trabajador: { company: misEmpresas } },
      include: { trabajador: { select: { nombre: true, company: { select: { name: true } } } } },
      orderBy: { periodo: "desc" },
      take: 8,
    }),
    prisma.mensajeChat.findMany({
      where: noLeidosPorStaffWhere(misEmpresas),
      include: { company: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const casosVencidos = casos.filter((c) => semaforoCaso(c.fechaLimite, c.estado) === "vencido");
  const casosUrgentes = casos.filter((c) => {
    const s = semaforoCaso(c.fechaLimite, c.estado);
    return s === "urgente" || s === "hoy";
  });

  const kpis = [
    { label: "Clientes supervisados", value: String(empresas.length), sub: "en tu cartera", accent: "bg-blue-500" },
    { label: "Casos vencidos", value: String(casosVencidos.length), sub: "requieren atención", accent: "bg-red-500" },
    { label: "Casos urgentes", value: String(casosUrgentes.length), sub: "vencen en 3 días o menos", accent: "bg-amber-500" },
    {
      label: "Nómina en riesgo",
      value: String(riesgoEnRevision.length),
      sub: "esperando tu revisión",
      accent: "bg-red-500",
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Supervisión de clientes y procesos de tu cartera.</p>
      </header>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Kpi key={k.label} {...k} />
        ))}
      </section>

      {mensajesSinLeer.length > 0 && (
        <section className="rounded-xl border-2 border-teal-500 bg-teal-50 p-5 shadow-sm">
          <p className="mb-3 font-semibold text-teal-900">💬 Mensajes de clientes sin leer</p>
          <ul className="space-y-2">
            {mensajesSinLeer.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/empresas/${m.company.id}#chat`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-teal-100 hover:bg-teal-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{m.company.name}</span>
                    <span className="block truncate text-sm text-slate-500">{m.contenido}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-teal-600">Responder →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Casos que requieren atención</h2>
            <Link href="/casos" className="text-sm font-medium text-teal-600 hover:underline">
              Ver todos →
            </Link>
          </div>
          {[...casosVencidos, ...casosUrgentes].length === 0 ? (
            <p className="text-sm text-slate-400">Sin casos urgentes o vencidos por ahora.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...casosVencidos, ...casosUrgentes].slice(0, 8).map((c) => {
                const s = semaforoCaso(c.fechaLimite, c.estado);
                return (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${semaforoClass[s]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{c.company.name}</p>
                      <p className="truncate text-xs text-slate-500">{c.obligacion.nombre}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {c.fechaLimite ? dateFmt.format(c.fechaLimite) : "sin fecha"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Nómina en riesgo por revisar</h2>
            <Link href="/riesgo-nomina" className="text-sm font-medium text-teal-600 hover:underline">
              Ver todas →
            </Link>
          </div>
          {riesgoEnRevision.length === 0 ? (
            <p className="text-sm text-slate-400">Sin declaraciones en riesgo pendientes.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {riesgoEnRevision.map((d) => (
                <li key={d.id} className="py-2.5">
                  <p className="text-sm font-medium text-slate-800">{d.trabajador.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {d.trabajador.company.name} · {d.periodo}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold text-slate-900">Clientes supervisados</h2>
        {empresas.length === 0 ? (
          <p className="text-sm text-slate-400">No tienes clientes asignados como supervisor.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {empresas.map((e) => (
              <li key={e.id}>
                <Link href={`/empresas/${e.id}`} className="flex items-center justify-between py-2.5 hover:bg-slate-50">
                  <span className="text-sm text-slate-700">{e.name}</span>
                  <span className="text-xs text-slate-500">
                    {estadoClienteLabels[e.estadoCliente] ?? e.estadoCliente} · Analista: {e.analista?.name ?? "sin asignar"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Analista ─────────────────────────────────────────────────────────────────
// "Mi día": lo primero que un analista necesita ver al entrar — qué se le
// venció, qué vence hoy, qué tiene por delante esta semana, y qué mensajes de
// clientes le están esperando. Acción inmediata, no reportes de fondo.
async function AnalistaDashboard({ session }: { session: SessionUser | null }) {
  const ts = taskScope(session);
  const now = new Date();
  const inicioHoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const finHoy = new Date(inicioHoy.getTime() + 86_400_000);
  const enUnaSemana = new Date(inicioHoy.getTime() + 7 * 86_400_000);

  const [tareasVencidas, tareasHoy, tareasProximas, mensajesSinLeer, casosPropios] = await Promise.all([
    prisma.task.findMany({
      where: { done: false, dueDate: { lt: inicioHoy }, ...ts },
      orderBy: { dueDate: "asc" },
      include: { contact: true },
    }),
    prisma.task.findMany({
      where: { done: false, dueDate: { gte: inicioHoy, lt: finHoy }, ...ts },
      orderBy: { dueDate: "asc" },
      include: { contact: true },
    }),
    prisma.task.findMany({
      where: { done: false, dueDate: { gte: finHoy, lte: enUnaSemana }, ...ts },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: { contact: true },
    }),
    prisma.mensajeChat.findMany({
      where: noLeidosPorStaffWhere(companyScope(session)),
      include: { company: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.casoRecurrente.findMany({
      where: { estado: { not: "presentado" }, ...recurringCaseScope(session) },
      select: {
        id: true,
        estado: true,
        fechaLimite: true,
        company: { select: { id: true, name: true } },
        obligacion: { select: { nombre: true } },
      },
      orderBy: { fechaLimite: "asc" },
    }),
  ]);

  const casosUrgentes = casosPropios
    .map((c) => ({ ...c, semaforo: semaforoCaso(c.fechaLimite, c.estado) }))
    .filter((c) => c.semaforo === "vencido" || c.semaforo === "hoy" || c.semaforo === "urgente")
    .slice(0, 6);

  const kpis = [
    { label: "Tareas vencidas", value: String(tareasVencidas.length), sub: "atrasadas", accent: "bg-red-500" },
    { label: "Vencen hoy", value: String(tareasHoy.length), sub: "para hoy", accent: "bg-amber-500" },
    { label: "Próximos 7 días", value: String(tareasProximas.length), sub: "por delante", accent: "bg-blue-500" },
    { label: "Mensajes sin leer", value: String(mensajesSinLeer.length), sub: "de clientes", accent: "bg-teal-500" },
  ];

  const taskRow = (t: (typeof tareasVencidas)[number], tono: "red" | "amber" | "slate") => (
    <li key={t.id} className="flex items-center justify-between py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
        <p className="truncate text-xs text-slate-500">
          {iconFor(t.type)} {legacyTypeLabels[t.type] ?? t.type}
          {t.contact && ` · ${t.contact.firstName} ${t.contact.lastName}`}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
          tono === "red" ? "bg-red-50 text-red-600" : tono === "amber" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
        }`}
      >
        {t.dueDate ? dateFmt.format(t.dueDate) : "Sin fecha"}
      </span>
    </li>
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Mi día</h1>
        <p className="text-sm text-slate-500">Todo lo que necesitas atender hoy, en un solo lugar.</p>
      </header>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Kpi key={k.label} {...k} />
        ))}
      </section>

      {mensajesSinLeer.length > 0 && (
        <section className="rounded-xl border-2 border-teal-500 bg-teal-50 p-5 shadow-sm">
          <p className="mb-3 font-semibold text-teal-900">💬 Mensajes de clientes sin leer</p>
          <ul className="space-y-2">
            {mensajesSinLeer.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/empresas/${m.company.id}#chat`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-teal-100 hover:bg-teal-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{m.company.name}</span>
                    <span className="block truncate text-sm text-slate-500">{m.contenido}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-teal-600">Responder →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Vencidas</h2>
            <Link href="/tareas" className="text-sm font-medium text-teal-600 hover:underline">
              Ver todas →
            </Link>
          </div>
          {tareasVencidas.length === 0 ? (
            <p className="text-sm text-slate-400">Sin tareas atrasadas. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100">{tareasVencidas.map((t) => taskRow(t, "red"))}</ul>
          )}
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Hoy</h2>
            <Link href="/tareas" className="text-sm font-medium text-teal-600 hover:underline">
              Ver todas →
            </Link>
          </div>
          {tareasHoy.length === 0 ? (
            <p className="text-sm text-slate-400">Nada para hoy.</p>
          ) : (
            <ul className="divide-y divide-slate-100">{tareasHoy.map((t) => taskRow(t, "amber"))}</ul>
          )}
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Próximos 7 días</h2>
            <Link href="/tareas" className="text-sm font-medium text-teal-600 hover:underline">
              Ver todas →
            </Link>
          </div>
          {tareasProximas.length === 0 ? (
            <p className="text-sm text-slate-400">Sin tareas próximas.</p>
          ) : (
            <ul className="divide-y divide-slate-100">{tareasProximas.map((t) => taskRow(t, "slate"))}</ul>
          )}
        </section>
      </div>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Casos urgentes de tu cartera</h2>
          <Link href="/casos" className="text-sm font-medium text-teal-600 hover:underline">
            Ver todos →
          </Link>
        </div>
        {casosUrgentes.length === 0 ? (
          <p className="text-sm text-slate-400">Sin casos vencidos o urgentes en tu cartera.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {casosUrgentes.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${semaforoClass[c.semaforo]}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{c.company.name}</p>
                  <p className="truncate text-xs text-slate-500">{c.obligacion.nombre}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {c.fechaLimite ? dateFmt.format(c.fechaLimite) : "sin fecha"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
