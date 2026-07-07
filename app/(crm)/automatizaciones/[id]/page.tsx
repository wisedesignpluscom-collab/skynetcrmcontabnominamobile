import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAutomations } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import { loadDraft } from "@/lib/engine/persist";
import { listVersions } from "@/lib/engine/versions";
import RuleBuilder from "@/components/automations/RuleBuilder";
import HistoryPanel from "@/components/automations/HistoryPanel";
import { loadBuilderOptions } from "../data";

export const dynamic = "force-dynamic";

const dateFmt = (d: Date) =>
  d.toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function EditarAutomatizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || !canManageAutomations(session.role)) redirect("/");

  const { id } = await params;
  const [loaded, options, rule, versions] = await Promise.all([
    loadDraft(id),
    loadBuilderOptions(),
    prisma.rule.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } },
    }),
    listVersions(id),
  ]);
  if (!loaded || !rule) notFound();

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
        {/* Auditoría: quién creó / modificó por última vez */}
        <p className="mt-1 text-xs text-slate-400">
          Creada por {rule.createdBy?.name ?? "—"} el {dateFmt(rule.createdAt)}
          {" · "}
          Última modificación: {rule.updatedBy?.name ?? "—"} el {dateFmt(rule.updatedAt)}
        </p>
      </header>
      <RuleBuilder
        ruleId={id}
        initialDraft={loaded.draft}
        options={options}
        isSystem={loaded.isSystem}
      />
      <HistoryPanel ruleId={id} versions={versions} canRestore={!loaded.isSystem} />
    </div>
  );
}
