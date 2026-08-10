import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import {
  guardarConfiguracionNomina,
  guardarCuentasContables,
  autoasignarCuentasContables,
  guardarCompensacionUsd,
  guardarBeneficios,
  guardarParametrosLegales,
  asegurarCatalogosNomina,
} from "./actions";
import JornadasPanel from "@/components/nomina/JornadasPanel";
import ConceptosPanel from "@/components/nomina/ConceptosPanel";
import AportesPanel from "@/components/nomina/AportesPanel";
import { FRECUENCIAS_PAGO, frecuenciaPagoLabels } from "@/lib/jornadas";
import { MONEDAS, monedaLabels } from "@/lib/clientes";
import { TIPOS_DISTRIBUCION_UTILIDADES, tipoDistribucionUtilidadesLabels } from "@/lib/beneficiosNomina";

export const dynamic = "force-dynamic";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

// Las 7 secciones de la especificación — todas construidas desde 2.4.
const SECCIONES = [
  { key: "pais_monedas", label: "País y monedas", built: true },
  { key: "horarios", label: "Horarios y jornadas", built: true },
  { key: "cuentas", label: "Cuentas contables", built: true },
  { key: "conceptos", label: "Conceptos y bonos", built: true },
  { key: "compensacion_usd", label: "Compensación USD", built: true },
  { key: "beneficios", label: "Beneficios y políticas", built: true },
  { key: "parametros_legales", label: "Parámetros legales", built: true },
] as const;

export default async function ConfiguracionNominaPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ seccion?: string }>;
}) {
  const { companyId } = await params;
  const { seccion } = await searchParams;
  const activa = SECCIONES.some((s) => s.key === seccion) ? seccion! : "pais_monedas";

  // Conceptos y aportes se siembran con el catálogo estándar la primera vez
  // que se abre esa sección (idempotente) — no hace falta en las demás.
  if (activa === "conceptos" || activa === "parametros_legales") {
    await asegurarCatalogosNomina(companyId);
  }

  const [company, config, jornadas, conceptos, aportes, session] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.configuracionNomina.findUnique({ where: { companyId } }),
    prisma.jornada.findMany({ where: { companyId }, orderBy: { nombre: "asc" } }),
    activa === "conceptos"
      ? prisma.conceptoNomina.findMany({ where: { companyId }, orderBy: [{ isSystem: "desc" }, { nombre: "asc" }] })
      : Promise.resolve([]),
    activa === "parametros_legales"
      ? prisma.aporteLegal.findMany({ where: { companyId }, orderBy: [{ isSystem: "desc" }, { nombre: "asc" }] })
      : Promise.resolve([]),
    getSession(),
  ]);
  if (!company) notFound();

  const href = (s: string) => `/nomina/${companyId}/configuracion?seccion=${s}`;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 text-slate-500">
            <circle cx="12" cy="12" r="3" />
            <path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.7-1.6L13.4 2h-3l-.4 2.9a7 7 0 0 0-2.7 1.6l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .5.1 1.1.2 1.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.7 1.6l.4 2.9h3l.4-2.9a7 7 0 0 0 2.7-1.6l2.3 1 2-3.4-2-1.5c.1-.5.2-1 .2-1.6z" strokeLinejoin="round" />
          </svg>
          <h1 className="text-lg font-semibold text-slate-900">Configuración de nómina</h1>
          <span className="text-sm text-slate-400">· {company.name}</span>
        </div>
        <Link href={`/nomina/${companyId}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Cerrar
        </Link>
      </div>

      <div className="grid sm:grid-cols-[220px_1fr]">
        <nav className="space-y-1 border-b border-slate-100 p-3 sm:border-b-0 sm:border-r">
          {SECCIONES.map((s) => (
            <Link
              key={s.key}
              href={s.built ? href(s.key) : "#"}
              aria-disabled={!s.built}
              title={s.built ? undefined : "Próximamente"}
              className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                !s.built
                  ? "cursor-not-allowed text-slate-300"
                  : activa === s.key
                    ? "bg-teal-50 text-teal-700"
                    : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </nav>

        <div className="p-5">
          {activa === "pais_monedas" && (
            <form action={guardarConfiguracionNomina} className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <input type="hidden" name="companyId" value={companyId} />
              <label className="text-xs font-medium text-slate-500">
                País
                <select disabled defaultValue="Venezuela" className={`${inputClass} mt-1 w-full bg-slate-50 text-slate-500`}>
                  <option value="Venezuela">Venezuela</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500">
                Frecuencia de pago
                <select name="frecuenciaPago" defaultValue={config?.frecuenciaPago ?? "quincenal"} className={`${inputClass} mt-1 w-full`}>
                  {FRECUENCIAS_PAGO.map((f) => (
                    <option key={f} value={f}>
                      {frecuenciaPagoLabels[f]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500">
                Moneda — salario base
                <select name="monedaSalario" defaultValue={config?.monedaSalario ?? "USD"} className={`${inputClass} mt-1 w-full`}>
                  {MONEDAS.map((m) => (
                    <option key={m} value={m}>
                      {monedaLabels[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500">
                Moneda — bonos
                <select name="monedaBonos" defaultValue={config?.monedaBonos ?? "USD"} className={`${inputClass} mt-1 w-full`}>
                  {MONEDAS.map((m) => (
                    <option key={m} value={m}>
                      {monedaLabels[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500">
                Moneda — deducciones
                <select name="monedaDeducciones" defaultValue={config?.monedaDeducciones ?? "USD"} className={`${inputClass} mt-1 w-full`}>
                  {MONEDAS.map((m) => (
                    <option key={m} value={m}>
                      {monedaLabels[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500 sm:col-span-2">
                Notas internas
                <textarea name="notas" defaultValue={config?.notas ?? ""} rows={3} className={`${inputClass} mt-1 w-full`} />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 sm:col-span-2 sm:w-fit"
              >
                Guardar cambios
              </button>
            </form>
          )}

          {activa === "horarios" && (
            <JornadasPanel companyId={companyId} jornadas={jornadas} puedeEliminar={canDelete(session?.role)} />
          )}

          {activa === "cuentas" && (
            <div className="max-w-2xl space-y-4">
              <form action={guardarCuentasContables} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="companyId" value={companyId} />
                <label className="text-xs font-medium text-slate-500">
                  Gasto de sueldos (debe)
                  <input
                    name="cuentaGastoSueldos"
                    defaultValue={config?.cuentaGastoSueldos ?? ""}
                    className={`${inputClass} mt-1 w-full`}
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Nómina por pagar (VES)
                  <input
                    name="cuentaNominaPorPagarVES"
                    defaultValue={config?.cuentaNominaPorPagarVES ?? ""}
                    className={`${inputClass} mt-1 w-full`}
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Nómina por pagar (USD)
                  <input
                    name="cuentaNominaPorPagarUSD"
                    defaultValue={config?.cuentaNominaPorPagarUSD ?? ""}
                    className={`${inputClass} mt-1 w-full`}
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Deducciones por pagar
                  <input
                    name="cuentaDeduccionesPorPagar"
                    defaultValue={config?.cuentaDeduccionesPorPagar ?? ""}
                    className={`${inputClass} mt-1 w-full`}
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 sm:col-span-2 sm:w-fit"
                >
                  Guardar cambios
                </button>
              </form>
              <form action={autoasignarCuentasContables}>
                <input type="hidden" name="companyId" value={companyId} />
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Autoasignar (plantilla estándar)
                </button>
              </form>
            </div>
          )}

          {activa === "conceptos" && (
            <ConceptosPanel companyId={companyId} conceptos={conceptos} puedeEliminar={canDelete(session?.role)} />
          )}

          {activa === "compensacion_usd" && (
            <form action={guardarCompensacionUsd} className="max-w-md space-y-4">
              <input type="hidden" name="companyId" value={companyId} />
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  name="compensacionUsdActiva"
                  defaultChecked={config?.compensacionUsdActiva}
                  className="h-4 w-4"
                />
                Igualar el neto a un objetivo en USD
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Objetivo USD (aplica a todos, salvo que la ficha del empleado lo sobre-escriba)
                <input
                  name="compensacionUsdObjetivo"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={config?.compensacionUsdObjetivo ?? ""}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Guardar cambios
              </button>
            </form>
          )}

          {activa === "beneficios" && (
            <form action={guardarBeneficios} className="max-w-2xl space-y-6">
              <input type="hidden" name="companyId" value={companyId} />

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-slate-800">Utilidades</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-medium text-slate-500">
                    Días al año
                    <input name="utilidadesDiasAnio" type="number" min="0" defaultValue={config?.utilidadesDiasAnio ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Mínimo legal (días)
                    <input name="utilidadesDiasMin" type="number" min="0" defaultValue={config?.utilidadesDiasMin ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Máximo legal (días)
                    <input name="utilidadesDiasMax" type="number" min="0" defaultValue={config?.utilidadesDiasMax ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                </div>
                <label className="block text-xs font-medium text-slate-500">
                  Tipo de distribución
                  <select
                    name="utilidadesTipoDistribucion"
                    defaultValue={config?.utilidadesTipoDistribucion ?? "pago_unico_diciembre"}
                    className={`${inputClass} mt-1 w-full sm:w-64`}
                  >
                    {TIPOS_DISTRIBUCION_UTILIDADES.map((t) => (
                      <option key={t} value={t}>
                        {tipoDistribucionUtilidadesLabels[t]}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-slate-800">Vacaciones</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-500">
                    Días extra sobre el mínimo legal
                    <input name="vacacionesDiasExtra" type="number" min="0" defaultValue={config?.vacacionesDiasExtra ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Bono vacacional — días extra
                    <input name="vacacionesBonoDiasExtra" type="number" min="0" defaultValue={config?.vacacionesBonoDiasExtra ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" name="vacacionesColectivas" defaultChecked={config?.vacacionesColectivas} className="h-4 w-4" />
                  Vacaciones colectivas
                </label>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-slate-800">Cestaticket</legend>
                <label className="block text-xs font-medium text-slate-500">
                  Objetivo mensual en USD (0 = solo el mínimo legal)
                  <input name="cestaticketObjetivoUsd" type="number" min="0" step="0.01" defaultValue={config?.cestaticketObjetivoUsd ?? ""} className={`${inputClass} mt-1 w-full sm:w-64`} />
                </label>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-slate-800">Anticipos y préstamos</legend>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" name="anticiposPrestamosActivo" defaultChecked={config?.anticiposPrestamosActivo} className="h-4 w-4" />
                  Habilitar anticipos y préstamos para este cliente
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  Notas
                  <textarea name="anticiposPrestamosNotas" defaultValue={config?.anticiposPrestamosNotas ?? ""} rows={2} className={`${inputClass} mt-1 w-full`} />
                </label>
              </fieldset>

              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Guardar cambios
              </button>
            </form>
          )}

          {activa === "parametros_legales" && (
            <div className="max-w-2xl space-y-6">
              <form action={guardarParametrosLegales} className="space-y-4">
                <input type="hidden" name="companyId" value={companyId} />
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    name="parametrosPersonalizados"
                    defaultChecked={config?.parametrosPersonalizados}
                    className="h-4 w-4"
                  />
                  Personalizar valores del país para este cliente
                </label>
                <p className="text-xs text-slate-400">
                  Mientras esté apagado, estos valores solo quedan guardados como referencia — el motor de riesgo FAO
                  sigue usando el salario mínimo oficial cargado en Configuración general.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-500">
                    Salario mínimo
                    <input name="salarioMinimoOverride" type="number" min="0" step="0.01" defaultValue={config?.salarioMinimoOverride ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Bono de guerra
                    <input name="bonoGuerraOverride" type="number" min="0" step="0.01" defaultValue={config?.bonoGuerraOverride ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Cestaticket mensual
                    <input name="cestaticketMensualOverride" type="number" min="0" step="0.01" defaultValue={config?.cestaticketMensualOverride ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Valor de la Unidad Tributaria
                    <input name="valorUTOverride" type="number" min="0" step="0.01" defaultValue={config?.valorUTOverride ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Jornada semanal (horas)
                    <input name="jornadaSemanalHorasOverride" type="number" min="0" step="0.5" defaultValue={config?.jornadaSemanalHorasOverride ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  Guardar cambios
                </button>
              </form>

              <AportesPanel companyId={companyId} aportes={aportes} puedeEliminar={canDelete(session?.role)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
