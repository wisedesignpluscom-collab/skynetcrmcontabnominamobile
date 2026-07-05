import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { createContact } from "../actions";
import { getOptions } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default async function NuevoContactoPage() {
  const [companies, sources] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    getOptions("source"),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link href="/contactos" className="text-sm font-medium text-teal-600 hover:underline">
          ← Volver a contactos
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Nuevo contacto</h1>
        <p className="text-sm text-slate-500">
          Registra una persona para empezar a trabajarla como lead o cliente.
        </p>
      </header>

      <form
        action={createContact}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input name="firstName" required className={inputClass} placeholder="Ana" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Apellido <span className="text-red-500">*</span>
            </label>
            <input name="lastName" required className={inputClass} placeholder="García" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input name="email" type="email" className={inputClass} placeholder="ana@empresa.com" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Teléfono</label>
            <input name="phone" className={inputClass} placeholder="+58 412 000 0000" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Cargo</label>
            <input name="position" className={inputClass} placeholder="Gerente comercial" />
          </div>
          <div>
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
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Origen del lead
            </label>
            <select name="source" defaultValue="" className={inputClass}>
              <option value="">Sin especificar</option>
              {sources.map((s) => (
                <option key={s.id} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Estado</label>
            <select name="status" defaultValue="lead" className={inputClass}>
              <option value="lead">Lead</option>
              <option value="cliente">Cliente</option>
            </select>
          </div>
        </div>

        <div>
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
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
          >
            Guardar contacto
          </button>
        </div>
      </form>
    </div>
  );
}
