import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAutomations } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { MODULES } from "@/lib/engine/builder";
import { deleteTemplate, duplicateTemplate } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const session = await getSession();
  if (!session || !canManageAutomations(session.role)) redirect("/");

  const templates = await prisma.emailTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plantillas de correo</h1>
          <p className="text-sm text-slate-500">
            Correos reutilizables con variables (nombre, empresa, monto…) para usarlos en las
            automatizaciones y en envíos manuales.
          </p>
        </div>
        <Link
          href="/plantillas/nueva"
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          + Nueva plantilla
        </Link>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {templates.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Aún no hay plantillas.{" "}
            <Link href="/plantillas/nueva" className="text-teal-600 hover:underline">
              Crear la primera →
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-52 flex-1">
                  <Link
                    href={`/plantillas/${t.id}`}
                    className="text-sm font-medium text-slate-800 hover:text-teal-700"
                  >
                    {t.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {MODULES[t.module]?.label ?? t.module} · {t.subject}
                  </p>
                </div>
                <Link
                  href={`/plantillas/${t.id}`}
                  className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Editar
                </Link>
                <form action={duplicateTemplate}>
                  <input type="hidden" name="templateId" value={t.id} />
                  <button type="submit" className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">
                    Duplicar
                  </button>
                </form>
                <form action={deleteTemplate}>
                  <input type="hidden" name="templateId" value={t.id} />
                  <button
                    type="submit"
                    title="Eliminar plantilla"
                    className="rounded px-1.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-50"
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
