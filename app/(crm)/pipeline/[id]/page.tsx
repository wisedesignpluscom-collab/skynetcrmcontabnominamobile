import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateDeal } from "../actions";
import { getSession } from "@/lib/session";
import { canApprove } from "@/lib/permissions";
import { DISCOUNT_APPROVAL_THRESHOLD } from "@/lib/deals";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default async function EditarOportunidadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ solicitud?: string }>;
}) {
  const { id } = await params;
  const { solicitud } = await searchParams;
  const session = await getSession();

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: { contact: true, company: true, stage: true, owner: true, pendingBy: true },
  });

  if (!deal) notFound();

  const approver = canApprove(session?.role);
  const pctLimit = Math.round(DISCOUNT_APPROVAL_THRESHOLD * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link href="/pipeline" className="text-sm font-medium text-teal-600 hover:underline">
          ← Volver al pipeline
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Editar oportunidad</h1>
        <p className="text-sm text-slate-500">
          {deal.contact && `${deal.contact.firstName} ${deal.contact.lastName}`}
          {deal.company && ` · ${deal.company.name}`}
          {" · Etapa: "}
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: deal.stage.color }}
          >
            {deal.stage.name}
          </span>
          {deal.owner && ` · Vendedor: ${deal.owner.name}`}
        </p>
      </header>

      {solicitud === "enviada" && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          ✔ Solicitud enviada — el nuevo valor se aplicará cuando el supervisor la apruebe.
        </p>
      )}

      {deal.pendingAction === "discount" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">⏳ Descuento pendiente de aprobación</p>
          <p className="mt-1">
            Valor solicitado: <strong>{money.format(deal.pendingAmount ?? 0)}</strong> (actual:{" "}
            {money.format(deal.amount)}) · pedido por {deal.pendingBy?.name ?? "vendedor"}
            {deal.pendingReason && ` · Motivo: ${deal.pendingReason}`}
          </p>
        </div>
      )}

      {deal.pendingAction === "lost" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">⏳ Pérdida pendiente de aprobación</p>
          <p className="mt-1">
            Pedida por {deal.pendingBy?.name ?? "vendedor"}
            {deal.pendingReason && ` · Motivo: ${deal.pendingReason}`}
          </p>
        </div>
      )}

      <form
        action={updateDeal}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="dealId" value={deal.id} />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Título <span className="text-red-500">*</span>
          </label>
          <input name="title" required defaultValue={deal.title} className={inputClass} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Valor (USD)
            </label>
            <input
              name="amount"
              type="number"
              min="0"
              step="any"
              defaultValue={deal.amount}
              className={inputClass}
            />
            {!approver && (
              <p className="mt-1 text-xs text-slate-400">
                Rebajas mayores al {pctLimit}% requieren aprobación del supervisor.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Cierre esperado
            </label>
            <input
              name="expectedCloseDate"
              type="date"
              defaultValue={
                deal.expectedCloseDate
                  ? deal.expectedCloseDate.toISOString().slice(0, 10)
                  : ""
              }
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Motivo del cambio
          </label>
          <input
            name="reason"
            placeholder="Ej: cliente pidió ajuste de alcance, descuento por pago anual…"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-400">
            Obligatorio si pides un descuento — ayuda al supervisor a decidir rápido.
          </p>
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
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  );
}
