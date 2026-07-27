import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { canReassign, companyScope } from "@/lib/permissions";
import { etiquetaPeriodo } from "@/lib/fiscal/vencimientos";
import { periodoActual } from "@/lib/fiscal/data";
import {
  ESTADOS_PAGO,
  estadoPagoLabels,
  estadoPagoClass,
  tipoFacturaLabels,
  totalesPorEstado,
  porCobrar,
  formatTotales,
  formatMonto,
} from "@/lib/facturacion";
import { marcarPagada, guardarNotaFactura, correrFacturacion } from "./actions";

export const dynamic = "force-dynamic";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });

export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; estado?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const filtros = await searchParams;
  const puedeCobrar = canReassign(session.role);

  // El analista ve la facturación de su cartera; gerencia y supervisión, toda
  const scope = { company: companyScope(session) };
  const where = {
    ...scope,
    ...(filtros.periodo ? { periodo: filtros.periodo } : {}),
    ...(filtros.estado ? { estadoPago: filtros.estado } : {}),
  };

  const [facturas, todas, periodosRaw] = await Promise.all([
    prisma.facturacion.findMany({
      where,
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ fechaEmision: "desc" }],
      take: 300,
    }),
    // Sin filtro de estado: los totales de la cabecera son del período completo
    prisma.facturacion.findMany({
      where: { ...scope, ...(filtros.periodo ? { periodo: filtros.periodo } : {}) },
      select: { monto: true, moneda: true, estadoPago: true },
    }),
    prisma.facturacion.findMany({
      where: scope,
      distinct: ["periodo"],
      select: { periodo: true },
      orderBy: { periodo: "desc" },
      take: 24,
    }),
  ]);

  const totales = totalesPorEstado(todas);
  const pendienteDeCobro = porCobrar(todas);
  const periodos = periodosRaw.map((p) => p.periodo);

  const link = (cambio: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filtros, ...cambio })) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/facturacion?${qs}` : "/facturacion";
  };

  const chip = (activo: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      activo ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Facturación</h1>
          <p className="text-sm text-slate-500">
            El honorario de cada plan activo se emite solo cada mes, y el servicio individual al
            entregarse. Aquí se lleva el cobro.
          </p>
        </div>
        {puedeCobrar && (
          <form action={correrFacturacion}>
            <button
              type="submit"
              title={`Emite lo que falte de ${etiquetaPeriodo(periodoActual("mensual"))} sin esperar al barrido automático`}
              className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
            >
              Correr facturación del mes
            </button>
          </form>
        )}
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500" title="Pendientes más vencidas">
            Total por cobrar
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatTotales(pendienteDeCobro)}</p>
        </div>
        {ESTADOS_PAGO.map((e) => (
          <div key={e} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{estadoPagoLabels[e]}</p>
            <p
              className={`mt-1 text-lg font-bold ${
                e === "pagado" ? "text-emerald-600" : e === "vencido" ? "text-red-600" : "text-amber-600"
              }`}
            >
              {formatTotales(totales[e])}
            </p>
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
          {ESTADOS_PAGO.map((e) => (
            <Link key={e} href={link({ estado: e })} className={chip(filtros.estado === e)}>
              {estadoPagoLabels[e]}
            </Link>
          ))}
        </div>
      </section>

      {facturas.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            Todavía no hay cobros con estos filtros.
            {puedeCobrar && " Si ya hay planes activos, usa «Correr facturación del mes»."}
          </p>
        </section>
      ) : (
        <ul className="space-y-2">
          {facturas.map((f) => (
            <li key={f.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{f.concepto}</p>
                  <p className="truncate text-xs text-slate-500">
                    <Link href={`/empresas/${f.company.id}`} className="hover:text-teal-700 hover:underline">
                      {f.company.name}
                    </Link>
                    {" · "}
                    {tipoFacturaLabels[f.tipo] ?? f.tipo}
                    {" · emitida "}
                    {fechaCorta(f.fechaEmision)}
                    {f.fechaPago && ` · cobrada ${fechaCorta(f.fechaPago)}`}
                  </p>
                </div>
                <p className="text-sm font-bold text-slate-800">{formatMonto(f.monto, f.moneda)}</p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    estadoPagoClass[f.estadoPago] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {estadoPagoLabels[f.estadoPago] ?? f.estadoPago}
                </span>
                {puedeCobrar && (
                  <form action={marcarPagada}>
                    <input type="hidden" name="id" value={f.id} />
                    <input
                      type="hidden"
                      name="estadoPago"
                      value={f.estadoPago === "pagado" ? "pendiente" : "pagado"}
                    />
                    <button
                      type="submit"
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        f.estadoPago === "pagado"
                          ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {f.estadoPago === "pagado" ? "Revertir cobro" : "Marcar cobrada"}
                    </button>
                  </form>
                )}
              </div>

              {puedeCobrar && (
                <form action={guardarNotaFactura} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={f.id} />
                  <input
                    name="notas"
                    defaultValue={f.notas ?? ""}
                    placeholder="Nota de cobranza…"
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Guardar
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
