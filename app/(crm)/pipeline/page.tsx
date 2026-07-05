import { prisma } from "@/lib/prisma";
import Link from "next/link";
import PipelineBoard, { type BoardStage } from "@/components/PipelineBoard";
import { getSession } from "@/lib/session";
import { canDelete, canApprove } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const session = await getSession();
  const stages = await prisma.pipelineStage.findMany({
    orderBy: { order: "asc" },
    include: {
      deals: {
        orderBy: { updatedAt: "desc" },
        include: { contact: true, company: true, owner: true },
      },
    },
  });

  const boardStages: BoardStage[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    type: s.type,
    deals: s.deals.map((d) => ({
      id: d.id,
      title: d.title,
      amount: d.amount,
      contactName: d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : null,
      companyName: d.company?.name ?? null,
      ownerName: d.owner?.name ?? null,
      pendingAction: d.pendingAction,
    })),
  }));

  const openValue = boardStages
    .filter((s) => s.type === "open")
    .reduce((sum, s) => sum + s.deals.reduce((x, d) => x + d.amount, 0), 0);

  const money = new Intl.NumberFormat("es", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline de ventas</h1>
          <p className="text-sm text-slate-500">
            Arrastra las oportunidades entre etapas. Valor abierto: {" "}
            <span className="font-semibold text-slate-700">{money.format(openValue)}</span>
            {" "}— al soltar en <span className="font-medium text-emerald-600">Ganado</span> el
            cliente pasa automáticamente a posventa.
          </p>
        </div>
        <Link
          href="/pipeline/nueva"
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          + Nueva oportunidad
        </Link>
      </header>
      <PipelineBoard
        stages={boardStages}
        allowDelete={canDelete(session?.role)}
        isApprover={canApprove(session?.role)}
      />
    </div>
  );
}
