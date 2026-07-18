import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOptions } from "@/lib/catalog";
import { updateContact } from "../../actions";
import { getSession } from "@/lib/session";
import { ownsOrCanSeeAll } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default async function EditarContactoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const [contact, companies, sources] = await Promise.all([
    prisma.contact.findUnique({ where: { id } }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    getOptions("source"),
  ]);
  if (!contact) notFound();
  // El vendedor solo edita sus propios contactos (protección de URL directa)
  if (!ownsOrCanSeeAll(session, contact.ownerId)) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link href={`/contactos/${id}`} className="text-sm font-medium text-teal-600 hover:underline">
          ← Volver al contacto
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Editar contacto</h1>
      </header>

      <form
        action={updateContact}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="contactId" value={id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input name="firstName" required defaultValue={contact.firstName} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Apellido <span className="text-red-500">*</span>
            </label>
            <input name="lastName" required defaultValue={contact.lastName} className={inputClass} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input name="email" type="email" defaultValue={contact.email ?? ""} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Teléfono</label>
            <input name="phone" defaultValue={contact.phone ?? ""} className={inputClass} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Cargo</label>
            <input name="position" defaultValue={contact.position ?? ""} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Empresa</label>
            <select name="companyId" defaultValue={contact.companyId ?? ""} className={inputClass}>
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
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Origen del lead</label>
            <select name="source" defaultValue={contact.source ?? ""} className={inputClass}>
              <option value="">Sin especificar</option>
              {sources.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Estado</label>
            <select name="status" defaultValue={contact.status} className={inputClass}>
              <option value="lead">Lead</option>
              <option value="cliente">Cliente</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Notas</label>
          <textarea name="notes" rows={3} defaultValue={contact.notes ?? ""} className={inputClass} />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
          <Link
            href={`/contactos/${id}`}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
          >
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  );
}
