import { prisma } from "@/lib/prisma";
import Link from "next/link";
import WhatsAppButton from "@/components/WhatsAppButton";
import { hasValidPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const sourceLabels: Record<string, string> = {
  web: "Sitio web",
  referido: "Referido",
  redes: "Redes sociales",
  llamada: "Llamada",
  evento: "Evento",
  otro: "Otro",
};

export default async function ContactosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const contacts = await prisma.contact.findMany({
    where: query
      ? {
          OR: [
            { firstName: { contains: query } },
            { lastName: { contains: query } },
            { email: { contains: query } },
            { phone: { contains: query } },
            { company: { name: { contains: query } } },
          ],
        }
      : undefined,
    include: { company: true, owner: true, deals: { where: { status: "open" } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contactos</h1>
          <p className="text-sm text-slate-500">
            {contacts.length} {contacts.length === 1 ? "contacto" : "contactos"}
            {query && ` para "${query}"`}
          </p>
        </div>
        <Link
          href="/contactos/nuevo"
          className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          + Nuevo contacto
        </Link>
      </header>

      {/* Búsqueda */}
      <form action="/contactos" className="max-w-md">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Buscar por nombre, email, teléfono o empresa…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>
      </form>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Empresa</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium">Vendedor</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Oportunidades</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  {query
                    ? "No se encontraron contactos con esa búsqueda."
                    : "Aún no hay contactos. Crea el primero con el botón «Nuevo contacto»."}
                </td>
              </tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-teal-50/40">
                <td className="px-4 py-3">
                  <Link
                    href={`/contactos/${c.id}`}
                    className="flex items-center gap-2.5 font-medium text-slate-800 hover:text-teal-700"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-blue-600 text-xs font-bold text-white">
                      {c.firstName[0]}
                      {c.lastName[0]}
                    </span>
                    {c.firstName} {c.lastName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.company?.name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="flex items-center gap-1">
                    {c.phone ?? "—"}
                    {hasValidPhone(c.phone) && (
                      <WhatsAppButton
                        compact
                        phone={c.phone}
                        message={`Hola ${c.firstName}, ¿cómo estás?`}
                      />
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {c.source ? sourceLabels[c.source] ?? c.source : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">{c.owner?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      c.status === "cliente"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {c.status === "cliente" ? "Cliente" : "Lead"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {c.deals.length > 0 ? c.deals.length : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
