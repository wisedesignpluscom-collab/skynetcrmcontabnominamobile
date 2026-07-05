import Link from "next/link";
import { createCompany } from "../actions";
import { getOptions } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default async function NuevaEmpresaPage() {
  const industries = await getOptions("industry");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link href="/empresas" className="text-sm font-medium text-teal-600 hover:underline">
          ← Volver a empresas
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Nueva empresa</h1>
        <p className="text-sm text-slate-500">
          Registra una organización para vincularle contactos y oportunidades.
        </p>
      </header>

      <form
        action={createCompany}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input name="name" required className={inputClass} placeholder="Comercial Andina S.A.S." />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Sector</label>
            <select name="industry" defaultValue="" className={inputClass}>
              <option value="">Sin especificar</option>
              {industries.map((i) => (
                <option key={i.id} value={i.label}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Sitio web</label>
            <input name="website" className={inputClass} placeholder="https://…" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Teléfono</label>
            <input name="phone" className={inputClass} placeholder="+58 212 000 0000" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Ciudad</label>
            <input name="city" className={inputClass} placeholder="Caracas" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Dirección</label>
          <input name="address" className={inputClass} placeholder="Calle 00 # 00-00" />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Notas</label>
          <textarea name="notes" rows={3} className={inputClass} placeholder="Contexto de la empresa…" />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
          <Link
            href="/empresas"
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
          >
            Guardar empresa
          </button>
        </div>
      </form>
    </div>
  );
}
