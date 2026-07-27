import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateDeal, requestDealDeletion } from "../actions";
import { getSession } from "@/lib/session";
import { canApprove, ownsOrCanSeeAll, roleLabels } from "@/lib/permissions";

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
  // El vendedor solo accede a sus propias oportunidades (protección de URL directa)
  if (!ownsOrCanSeeAll(session, deal.ownerId)) notFound();

  const approver = canApprove(session?.role);

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
          {deal.owner && ` · ${roleLabels.vendedor}: ${deal.owner.name}`}
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
            {money.format(deal.amount)}) · pedido por {deal.pendingBy?.name ?? "un analista"}
            {deal.pendingReason && ` · Motivo: ${deal.pendingReason}`}
          </p>
        </div>
      )}

      {deal.pendingAction === "lost" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">⏳ Pérdida pendiente de aprobación</p>
          <p className="mt-1">
            Pedida por {deal.pendingBy?.name ?? "un analista"}
            {deal.pendingReason && ` · Motivo: ${deal.pendingReason}`}
          </p>
        </div>
      )}

      {deal.pendingAction === "delete" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">⏳ Eliminación pendiente de aprobación</p>
          <p className="mt-1">
            Pedida por {deal.pendingBy?.name ?? "un analista"}
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
                Cualquier rebaja del precio requiere aprobación del supervisor.
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

      {deal.pendingAction !== "delete" && (
        <form action={requestDealDeletion} className="rounded-xl border border-red-100 bg-red-50/50 p-5">
          <input type="hidden" name="dealId" value={deal.id} />
          <p className="text-sm font-semibold text-red-700">
            {approver ? "Eliminar oportunidad" : "Solicitar eliminación"}
          </p>
          <p className="mb-3 text-xs text-slate-500">
            {approver
              ? "Se elimina de inmediato (no se puede deshacer)."
              : "El analista no puede eliminar directamente: el supervisor debe aprobar."}
          </p>
          {!approver && (
            <input
              name="reason"
              placeholder="Motivo de la eliminación…"
              className={`${inputClass} mb-3`}
            />
          )}
          <button
            type="submit"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            {approver ? "Eliminar oportunidad" : "Solicitar eliminación"}
          </button>
        </form>
      )}
    </div>
  );
}
