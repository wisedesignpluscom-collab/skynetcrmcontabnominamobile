"use client";

// Ficha del cliente contable — un solo formulario para crear y editar.
// Sigue el patrón de ContactoNuevoForm: RuleForm aplica las Form Rules en el
// cliente y useActionState muestra los errores de validación del servidor.

import Link from "next/link";
import { useActionState } from "react";
import RuleForm from "@/components/RuleForm";
import { createCompany, updateCompany } from "@/app/(crm)/empresas/actions";
import { parseMulti } from "@/lib/multivalor";
import { ESTADOS_CLIENTE, estadoClienteLabels, MONEDAS, monedaLabels } from "@/lib/clientes";
import type { RuleDef } from "@/lib/engine/evaluator";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export type ClienteFormData = {
  id: string;
  name: string;
  rif: string | null;
  industry: string | null;
  regimenTributario: string | null;
  municipios: string | null;
  tamano: string | null;
  moneda: string;
  estadoCliente: string;
  fechaCierre: Date | string | null;
  contadorAnterior: string | null;
  analistaId: string | null;
  supervisorId: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
};

// <input type="date"> exige exactamente aaaa-mm-dd
function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export default function ClienteForm({
  company,
  industries,
  municipios,
  regimenes,
  tamanos,
  users,
  rules,
  user,
  puedeReasignar,
}: {
  company: ClienteFormData | null;
  industries: string[];
  municipios: string[];
  regimenes: string[];
  tamanos: string[];
  users: { id: string; name: string; role: string }[];
  rules: RuleDef[];
  user: { id: string; role: string } | null;
  puedeReasignar: boolean;
}) {
  const editando = company !== null;
  const [state, formAction, pending] = useActionState(
    editando ? updateCompany : createCompany,
    undefined
  );
  const municipiosActuales = parseMulti(company?.municipios);
  const volverA = editando ? `/empresas/${company.id}` : "/empresas";

  return (
    <RuleForm rules={rules} user={user}>
      {state?.errors && state.errors.length > 0 && (
        <div className="mb-4 space-y-2">
          {state.errors.map((e, i) => (
            <p
              key={i}
              className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              {e}
            </p>
          ))}
        </div>
      )}

      <form action={formAction} className="space-y-6">
        {editando && <input type="hidden" name="companyId" value={company.id} />}

        {/* ── Identificación fiscal ── */}
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Identificación</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="name">
              <label className={labelClass}>
                Razón social <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                required
                defaultValue={company?.name ?? ""}
                className={inputClass}
                placeholder="Distribuidora Los Andes C.A."
              />
            </div>
            <div data-field="rif">
              <label className={labelClass}>RIF</label>
              <input
                name="rif"
                defaultValue={company?.rif ?? ""}
                className={inputClass}
                placeholder="J-12345678-9"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="industry">
              <label className={labelClass}>Sector económico</label>
              <select
                name="industry"
                defaultValue={company?.industry ?? ""}
                className={inputClass}
              >
                <option value="">Sin especificar</option>
                {industries.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div data-field="regimenTributario">
              <label className={labelClass}>Régimen tributario</label>
              <select
                name="regimenTributario"
                defaultValue={company?.regimenTributario ?? ""}
                className={inputClass}
              >
                <option value="">Sin especificar</option>
                {regimenes.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div data-field="municipios">
            <label className={labelClass}>Municipios de operación</label>
            {municipios.length === 0 ? (
              <p className="text-sm text-slate-400">
                No hay municipios en el catálogo.{" "}
                <Link href="/configuracion" className="text-teal-600 hover:underline">
                  Agrégalos en Configuración
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {municipios.map((m) => (
                  <label
                    key={m}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-800"
                  >
                    <input
                      type="checkbox"
                      name="municipios"
                      value={m}
                      defaultChecked={municipiosActuales.includes(m)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30"
                    />
                    {m}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-slate-400">
              Determinan qué obligaciones municipales le corresponden al cliente.
            </p>
          </div>
        </section>

        {/* ── Relación comercial ── */}
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Relación comercial</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div data-field="estadoCliente">
              <label className={labelClass}>Estado del cliente</label>
              <select
                name="estadoCliente"
                defaultValue={company?.estadoCliente ?? "lead"}
                className={inputClass}
              >
                {ESTADOS_CLIENTE.map((e) => (
                  <option key={e} value={e}>
                    {estadoClienteLabels[e]}
                  </option>
                ))}
              </select>
            </div>
            <div data-field="tamano">
              <label className={labelClass}>Tamaño</label>
              <select name="tamano" defaultValue={company?.tamano ?? ""} className={inputClass}>
                <option value="">Sin especificar</option>
                {tamanos.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div data-field="moneda">
              <label className={labelClass}>Moneda de facturación</label>
              <select
                name="moneda"
                defaultValue={company?.moneda ?? "USD"}
                className={inputClass}
              >
                {MONEDAS.map((m) => (
                  <option key={m} value={m}>
                    {monedaLabels[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="fechaCierre">
              <label className={labelClass}>Fecha de cierre</label>
              <input
                type="date"
                name="fechaCierre"
                defaultValue={toDateInput(company?.fechaCierre)}
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Cuándo pasó a ser cliente activo.
              </p>
            </div>
            <div data-field="contadorAnterior">
              <label className={labelClass}>Contador anterior</label>
              <input
                name="contadorAnterior"
                defaultValue={company?.contadorAnterior ?? ""}
                className={inputClass}
                placeholder="Con quién llevaba la contabilidad"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="analistaId">
              <label className={labelClass}>Analista asignado</label>
              <select
                name="analistaId"
                defaultValue={company?.analistaId ?? ""}
                disabled={!puedeReasignar}
                className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
              >
                <option value="">Sin asignar</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div data-field="supervisorId">
              <label className={labelClass}>Supervisor asignado</label>
              <select
                name="supervisorId"
                defaultValue={company?.supervisorId ?? ""}
                disabled={!puedeReasignar}
                className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
              >
                <option value="">Sin asignar</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!puedeReasignar && (
            <p className="text-xs text-slate-400">
              Solo la gerencia y los supervisores pueden reasignar la cuenta.
            </p>
          )}
        </section>

        {/* ── Contacto ── */}
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Datos de contacto</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="phone">
              <label className={labelClass}>Teléfono</label>
              <input
                name="phone"
                defaultValue={company?.phone ?? ""}
                className={inputClass}
                placeholder="+58 251 000 0000"
              />
            </div>
            <div data-field="website">
              <label className={labelClass}>Sitio web</label>
              <input
                name="website"
                defaultValue={company?.website ?? ""}
                className={inputClass}
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="city">
              <label className={labelClass}>Ciudad</label>
              <input
                name="city"
                defaultValue={company?.city ?? ""}
                className={inputClass}
                placeholder="Barquisimeto"
              />
            </div>
            <div data-field="address">
              <label className={labelClass}>Dirección</label>
              <input
                name="address"
                defaultValue={company?.address ?? ""}
                className={inputClass}
                placeholder="Av. Lara, Edif. Centro…"
              />
            </div>
          </div>

          <div data-field="notes">
            <label className={labelClass}>Notas</label>
            <textarea
              name="notes"
              rows={3}
              defaultValue={company?.notes ?? ""}
              className={inputClass}
              placeholder="Contexto del cliente, particularidades de su contabilidad…"
            />
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <Link
            href={volverA}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Guardando…" : editando ? "Guardar cambios" : "Guardar cliente"}
          </button>
        </div>
      </form>
    </RuleForm>
  );
}
