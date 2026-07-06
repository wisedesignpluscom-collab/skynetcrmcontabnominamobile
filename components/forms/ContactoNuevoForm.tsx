"use client";

// Formulario de nuevo contacto, extendido con el Automation Engine:
// - RuleForm aplica las Form Rules en cada cambio de campo (cliente)
// - useActionState muestra los errores de las Validation Rules (servidor)
// El markup es el mismo que tenía la página; solo se movió a este componente
// cliente y se marcaron los envoltorios con data-field.

import Link from "next/link";
import { useActionState } from "react";
import RuleForm from "@/components/RuleForm";
import { createContact } from "@/app/(crm)/contactos/actions";
import type { RuleDef } from "@/lib/engine/evaluator";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default function ContactoNuevoForm({
  companies,
  sources,
  rules,
  user,
}: {
  companies: { id: string; name: string }[];
  sources: string[];
  rules: RuleDef[];
  user: { id: string; role: string } | null;
}) {
  const [state, formAction, pending] = useActionState(createContact, undefined);

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

      <form
        action={formAction}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div data-field="firstName">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input name="firstName" required className={inputClass} placeholder="Ana" />
          </div>
          <div data-field="lastName">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Apellido <span className="text-red-500">*</span>
            </label>
            <input name="lastName" required className={inputClass} placeholder="García" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div data-field="email">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input name="email" type="email" className={inputClass} placeholder="ana@empresa.com" />
          </div>
          <div data-field="phone">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Teléfono</label>
            <input name="phone" className={inputClass} placeholder="+58 412 000 0000" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div data-field="position">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Cargo</label>
            <input name="position" className={inputClass} placeholder="Gerente comercial" />
          </div>
          <div data-field="companyId">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Empresa</label>
            <select name="companyId" defaultValue="" className={inputClass}>
              <option value="">Sin empresa</option>
              {companies.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div data-field="source">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Origen del lead
            </label>
            <select name="source" defaultValue="" className={inputClass}>
              <option value="">Sin especificar</option>
              {sources.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div data-field="status">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Estado</label>
            <select name="status" defaultValue="lead" className={inputClass}>
              <option value="lead">Lead</option>
              <option value="cliente">Cliente</option>
            </select>
          </div>
        </div>

        <div data-field="notes">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Notas</label>
          <textarea
            name="notes"
            rows={3}
            className={inputClass}
            placeholder="Contexto, intereses, cómo llegó…"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
          <Link
            href="/contactos"
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar contacto"}
          </button>
        </div>
      </form>
    </RuleForm>
  );
}
