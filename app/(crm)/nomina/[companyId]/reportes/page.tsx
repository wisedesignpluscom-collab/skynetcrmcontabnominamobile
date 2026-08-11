import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { estadoCorridaLabels, estadoCorridaClass } from "@/lib/corridas";
import { estadoVacacionesLabels, estadoUtilidadesLabels, estadoLiquidacionLabels } from "@/lib/lottt";
import { fechaLocal } from "@/lib/fiscal/vencimientos";
import { marcarAportePagado, revertirPagoAporte } from "../operacion/actions";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toFixed(2)}`;
const fechaCorta = (d: Date) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
const hoyISO = () => new Date().toISOString().slice(0, 10);
const inicioMesISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

function fechaDeInput(raw: string | undefined, fallback: () => string): Date {
  const texto = raw?.trim() || fallback();
  const [a, m, d] = texto.split("-").map(Number);
  return fechaLocal(a, m, d);
}

const TABS = [
  { key: "costo_corrida", label: "Costo por corrida" },
  { key: "asistencia", label: "Asistencia" },
  { key: "cuentas_por_pagar", label: "Cuentas por pagar" },
  { key: "lottt", label: "LOTTT" },
] as const;

export default async function ReportesNominaPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string; tab?: string }>;
}) {
  const { companyId } = await params;
  const { desde: desdeParam, hasta: hastaParam, tab } = await searchParams;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) notFound();

  const activa = TABS.some((t) => t.key === tab) ? tab! : "costo_corrida";
  const desde = fechaDeInput(desdeParam, inicioMesISO);
  const hasta = fechaDeInput(hastaParam, hoyISO);

  const corridas = await prisma.corridaNomina.findMany({
    where: { companyId, fechaInicio: { lte: hasta }, fechaFin: { gte: desde } },
    orderBy: { fechaInicio: "asc" },
  });

  const totalBruto = corridas.reduce((s, c) => s + c.totalBruto, 0);
  const totalDeducciones = corridas.reduce((s, c) => s + c.totalDeducciones, 0);
  const totalNeto = corridas.reduce((s, c) => s + c.totalNeto, 0);
  const todoUsd = corridas.every((c) => c.moneda === "USD");

  const href = (extra: Record<string, string>) => {
    const usp = new URLSearchParams({
      desde: desdeParam || inicioMesISO(),
      hasta: hastaParam || hoyISO(),
      tab: activa,
      ...extra,
    });
    return `/nomina/${companyId}/reportes?${usp.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <Link href={`/nomina/${companyId}`} className="text-xs font-medium text-slate-400 hover:text-teal-700 hover:underline">
          ← Volver a Nómina
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Reportes de nómina</h1>

        <form action={`/nomina/${companyId}/reportes`} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value={activa} />
          <label className="text-xs text-slate-500">
            Desde
            <input type="date" name="desde" defaultValue={desdeParam || inicioMesISO()} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-teal-500" />
          </label>
          <label className="text-xs text-slate-500">
            Hasta
            <input type="date" name="hasta" defaultValue={hastaParam || hoyISO()} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-teal-500" />
          </label>
          <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700">
            Filtrar
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-lg font-bold text-slate-800">{money(totalBruto)}</p>
          <p className="text-xs text-slate-400">Bruto</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-lg font-bold text-slate-800">{money(totalDeducciones)}</p>
          <p className="text-xs text-slate-400">Deducciones</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-lg font-bold text-slate-800">{money(totalNeto)}</p>
          <p className="text-xs text-slate-400">Neto</p>
        </div>
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-center shadow-sm">
          <p className="text-lg font-bold text-teal-700">{todoUsd ? money(totalNeto) : "—"}</p>
          <p className="text-xs text-teal-600">{todoUsd ? "≈USD" : "≈USD no disponible (hay corridas en Bs)"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <nav className="flex flex-wrap gap-1 border-b border-slate-100 px-3 pt-3">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href({ tab: t.key })}
              className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
                activa === t.key ? "border-b-2 border-teal-600 text-teal-700" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="p-5">
          {activa === "costo_corrida" && <TablaCostoPorCorrida corridas={corridas} />}
          {activa === "asistencia" && <TablaAsistencia companyId={companyId} desde={desde} hasta={hasta} />}
          {activa === "cuentas_por_pagar" && <TablaCuentasPorPagar companyId={companyId} desde={desde} hasta={hasta} />}
          {activa === "lottt" && <TablaLottt companyId={companyId} desde={desde} hasta={hasta} />}
        </div>
      </div>
    </div>
  );
}

function TablaCostoPorCorrida({ corridas }: { corridas: Awaited<ReturnType<typeof prisma.corridaNomina.findMany>> }) {
  if (corridas.length === 0) return <p className="text-sm text-slate-400">Sin corridas en el rango.</p>;
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs text-slate-500">
        <tr>
          <th className="px-3 py-2">Período</th>
          <th className="px-3 py-2">Pago</th>
          <th className="px-3 py-2">Estado</th>
          <th className="px-3 py-2">Bruto</th>
          <th className="px-3 py-2">Deducciones</th>
          <th className="px-3 py-2">Neto</th>
          <th className="px-3 py-2">≈USD</th>
        </tr>
      </thead>
      <tbody>
        {corridas.map((c) => (
          <tr key={c.id} className="border-t border-slate-100">
            <td className="px-3 py-2 font-medium text-slate-800">{c.periodo}</td>
            <td className="px-3 py-2 text-slate-500">
              {fechaCorta(c.fechaInicio)} – {fechaCorta(c.fechaFin)}
            </td>
            <td className="px-3 py-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estadoCorridaClass[c.estado] ?? "bg-slate-100"}`}>
                {estadoCorridaLabels[c.estado] ?? c.estado}
              </span>
            </td>
            <td className="px-3 py-2">{money(c.totalBruto)}</td>
            <td className="px-3 py-2">{money(c.totalDeducciones)}</td>
            <td className="px-3 py-2">{money(c.totalNeto)}</td>
            <td className="px-3 py-2">{c.moneda === "USD" ? money(c.totalNeto) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function TablaAsistencia({ companyId, desde, hasta }: { companyId: string; desde: Date; hasta: Date }) {
  const asistencias = await prisma.asistenciaDia.findMany({
    where: { trabajador: { companyId }, fecha: { gte: desde, lte: hasta } },
    include: { trabajador: true },
  });
  const porTrabajador = new Map<string, { nombre: string; horas: number; dias: number }>();
  for (const a of asistencias) {
    if (a.horas <= 0) continue;
    const actual = porTrabajador.get(a.trabajadorId) ?? { nombre: a.trabajador.nombre, horas: 0, dias: 0 };
    actual.horas += a.horas;
    actual.dias += 1;
    porTrabajador.set(a.trabajadorId, actual);
  }
  const filas = [...porTrabajador.values()].sort((x, y) => x.nombre.localeCompare(y.nombre));

  if (filas.length === 0) return <p className="text-sm text-slate-400">Sin asistencia marcada en el rango.</p>;
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs text-slate-500">
        <tr>
          <th className="px-3 py-2">Empleado</th>
          <th className="px-3 py-2">Horas totales</th>
          <th className="px-3 py-2">Días marcados</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.nombre} className="border-t border-slate-100">
            <td className="px-3 py-2 font-medium text-slate-800">{f.nombre}</td>
            <td className="px-3 py-2">{f.horas}h</td>
            <td className="px-3 py-2">{f.dias}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Cuentas por pagar reales de nómina (Etapa 3.7): retención del trabajador +
// aporte patronal por ente, generadas al calcular cada corrida
// (lib/aportesPatronales.ts) — ya no es un estimado en vivo.
async function TablaCuentasPorPagar({ companyId, desde, hasta }: { companyId: string; desde: Date; hasta: Date }) {
  const aportes = await prisma.aportePorPagar.findMany({
    where: { companyId, corrida: { fechaInicio: { lte: hasta }, fechaFin: { gte: desde } } },
    include: { corrida: { select: { periodo: true } } },
    orderBy: [{ ente: "asc" }, { fechaGeneracion: "asc" }],
  });

  if (aportes.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Sin cuentas por pagar en el rango. Se generan al calcular una corrida — asegúrate de que los
        aportes de ley (Configuración → Parámetros legales) tengan un ente asignado.
      </p>
    );
  }

  const porEnte = new Map<string, number>();
  for (const a of aportes) porEnte.set(a.ente, (porEnte.get(a.ente) ?? 0) + a.montoTotal);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        {[...porEnte.entries()].map(([ente, total]) => (
          <div key={ente} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
            <span className="font-semibold text-slate-700">{ente}</span>{" "}
            <span className="text-slate-500">{money(total)}</span>
          </div>
        ))}
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2">Ente</th>
            <th className="px-3 py-2">Período</th>
            <th className="px-3 py-2">Retención trabajador</th>
            <th className="px-3 py-2">Aporte patronal</th>
            <th className="px-3 py-2">Total</th>
            <th className="px-3 py-2">Cuenta contable</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {aportes.map((a) => (
            <tr key={a.id} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-800">{a.ente}</td>
              <td className="px-3 py-2 text-slate-500">{a.corrida.periodo}</td>
              <td className="px-3 py-2">{money(a.montoTrabajador)}</td>
              <td className="px-3 py-2">{money(a.montoPatronal)}</td>
              <td className="px-3 py-2 font-semibold">{money(a.montoTotal)}</td>
              <td className="px-3 py-2 text-slate-500">{a.cuentaContable ?? "—"}</td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    a.estadoPago === "pagado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {a.estadoPago === "pagado" ? "Pagado" : "Pendiente"}
                </span>
              </td>
              <td className="px-3 py-2">
                <form action={a.estadoPago === "pagado" ? revertirPagoAporte : marcarAportePagado}>
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="text-xs font-medium text-teal-700 hover:underline">
                    {a.estadoPago === "pagado" ? "Revertir" : "Marcar pagada"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function TablaLottt({ companyId, desde, hasta }: { companyId: string; desde: Date; hasta: Date }) {
  const [vacaciones, utilidades, liquidaciones] = await Promise.all([
    prisma.registroVacaciones.findMany({ where: { trabajador: { companyId }, fechaCorte: { gte: desde, lte: hasta } }, include: { trabajador: true } }),
    prisma.registroUtilidades.findMany({ where: { trabajador: { companyId }, createdAt: { gte: desde, lte: hasta } }, include: { trabajador: true } }),
    prisma.liquidacion.findMany({ where: { trabajador: { companyId }, fechaEgreso: { gte: desde, lte: hasta } }, include: { trabajador: true } }),
  ]);

  if (vacaciones.length === 0 && utilidades.length === 0 && liquidaciones.length === 0) {
    return <p className="text-sm text-slate-400">Sin registros de Vacaciones, Utilidades o Liquidaciones en el rango.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-600">Vacaciones ({vacaciones.length})</p>
        <ul className="space-y-1 text-sm">
          {vacaciones.map((v) => (
            <li key={v.id} className="flex justify-between border-b border-slate-50 py-1">
              <span>{v.trabajador.nombre} — Año {v.anioServicio}</span>
              <span className="text-slate-500">{estadoVacacionesLabels[v.estado] ?? v.estado}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-600">Utilidades ({utilidades.length})</p>
        <ul className="space-y-1 text-sm">
          {utilidades.map((u) => (
            <li key={u.id} className="flex justify-between border-b border-slate-50 py-1">
              <span>{u.trabajador.nombre} — {u.anio}</span>
              <span className="text-slate-500">
                {money(u.montoCalculado)} · {estadoUtilidadesLabels[u.estado] ?? u.estado}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-600">Liquidaciones ({liquidaciones.length})</p>
        <ul className="space-y-1 text-sm">
          {liquidaciones.map((l) => (
            <li key={l.id} className="flex justify-between border-b border-slate-50 py-1">
              <span>{l.trabajador.nombre} — {fechaCorta(l.fechaEgreso)}</span>
              <span className="text-slate-500">
                {money(l.total)} · {estadoLiquidacionLabels[l.estado] ?? l.estado}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
