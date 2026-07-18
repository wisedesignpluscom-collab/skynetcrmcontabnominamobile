import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { createDeal } from "../actions";
import { getActiveServices, isPriceLocked } from "@/lib/services";
import DealPriceFields from "@/components/deals/DealPriceFields";
import { getSession } from "@/lib/session";
import { contactScope } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default async function NuevaOportunidadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; contactId?: string }>;
}) {
  const { error, contactId } = await searchParams;
  const session = await getSession();
  const [contacts, stages, services, lockPrice] = await Promise.all([
    prisma.contact.findMany({ where: contactScope(session), orderBy: { firstName: "asc" }, include: { company: true } }),
    prisma.pipelineStage.findMany({ where: { type: "open" }, orderBy: { order: "asc" } }),
    getActiveServices(),
    isPriceLocked(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link href="/pipeline" className="text-sm font-medium text-teal-600 hover:underline">
          ← Volver al pipeline
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Nueva oportunidad</h1>
        <p className="text-sm text-slate-500">
          Registra un negocio potencial y ubícalo en la etapa que corresponda.
        </p>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <form
        action={createDeal}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Título <span className="text-red-500">*</span>
          </label>
          <input
            name="title"
            required
            className={inputClass}
            placeholder="Ej: Página web corporativa, Plan de marketing anual…"
          />
        </div>

        <DealPriceFields
          services={services.map((s) => ({ id: s.id, name: s.name, price: s.price }))}
          lockPrice={lockPrice}
        />

        <div className="sm:w-1/2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Cierre esperado
          </label>
          <input name="expectedCloseDate" type="date" className={inputClass} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Contacto</label>
            <select name="contactId" defaultValue={contactId ?? ""} className={inputClass}>
              <option value="">Sin contacto</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                  {c.company ? ` — ${c.company.name}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              La empresa se toma automáticamente del contacto.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Etapa inicial <span className="text-red-500">*</span>
            </label>
            <select name="stageId" required defaultValue={stages[0]?.id} className={inputClass}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
          <Link
            href="/pipeline"
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
          >
            Crear oportunidad
          </button>
        </div>
      </form>
    </div>
  );
}
