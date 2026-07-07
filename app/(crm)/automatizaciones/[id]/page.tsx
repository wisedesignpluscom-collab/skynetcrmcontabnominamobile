import Link from "next/link";
import { getSession } from "@/lib/session";
import { canManageAutomations } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import { loadDraft } from "@/lib/engine/persist";
import RuleBuilder from "@/components/automations/RuleBuilder";
import { loadBuilderOptions } from "../data";

export const dynamic = "force-dynamic";

export default async function EditarAutomatizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || !canManageAutomations(session.role)) redirect("/");

  const { id } = await params;
  const [loaded, options] = await Promise.all([loadDraft(id), loadBuilderOptions()]);
  if (!loaded) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <p className="text-xs text-slate-400">
          <Link href="/automatizaciones" className="hover:text-teal-600">
            Automatizaciones
          </Link>{" "}
          / Editar
        </p>
        <h1 className="text-2xl font-bold text-slate-900">{loaded.draft.name}</h1>
      </header>
      <RuleBuilder
        ruleId={id}
        initialDraft={loaded.draft}
        options={options}
        isSystem={loaded.isSystem}
      />
    </div>
  );
}
