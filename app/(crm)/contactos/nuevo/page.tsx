import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getOptions } from "@/lib/catalog";
import { getSession } from "@/lib/session";
import { loadRules } from "@/lib/engine/load";
import { FORM_CHANGE_TRIGGER } from "@/lib/engine/formRules";
import ContactoNuevoForm from "@/components/forms/ContactoNuevoForm";

export const dynamic = "force-dynamic";

export default async function NuevoContactoPage() {
  const [companies, sources, rules, session] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    getOptions("source"),
    // Form Rules del módulo contacto — el cliente las evalúa en cada cambio
    loadRules({ module: "contact", trigger: FORM_CHANGE_TRIGGER }),
    getSession(),
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

      <ContactoNuevoForm
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        sources={sources.map((s) => s.label)}
        rules={rules}
        user={session ? { id: session.id, role: session.role } : null}
      />
    </div>
  );
}
