import Link from "next/link";
import { getSession } from "@/lib/session";
import { canManageAutomations } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { emptyDraft } from "@/lib/engine/builder";
import RuleBuilder from "@/components/automations/RuleBuilder";
import { loadBuilderOptions } from "../data";

export const dynamic = "force-dynamic";

export default async function NuevaAutomatizacionPage() {
  const session = await getSession();
  if (!session || !canManageAutomations(session.role)) redirect("/");

  const options = await loadBuilderOptions();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <p className="text-xs text-slate-400">
          <Link href="/automatizaciones" className="hover:text-teal-600">
            Automatizaciones
          </Link>{" "}
          / Nueva
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Nueva automatización</h1>
        <p className="text-sm text-slate-500">
          Arma el flujo en el diagrama: cuándo corre, qué condición revisa y qué hace si se
          cumple.
        </p>
      </header>
      <RuleBuilder ruleId={null} initialDraft={emptyDraft()} options={options} />
    </div>
  );
}
