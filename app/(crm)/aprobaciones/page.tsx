import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canApprove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { approveRequest, rejectRequest } from "./actions";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AprobacionesPage() {
  const session = await getSession();
  if (!canApprove(session?.role)) redirect("/");

  const pending = await prisma.deal.findMany({
    where: { pendingAction: { not: null } },
    include: { contact: true, company: true, stage: true, pendingBy: true },
    orderBy: { pendingAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Aprobaciones</h1>
        <p className="text-sm text-slate-500">
          Solicitudes de tu equipo que necesitan tu autorización como supervisor.
        </p>
      </header>

      {pending.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
          🎉 No hay solicitudes pendientes.
        </p>
      ) : (
        <div className="space-y-4">
          {pending.map((d) => {
            const isDiscount = d.pendingAction === "discount";
            const pct =
              isDiscount && d.amount > 0 && d.pendingAmount != null
                ? Math.round((1 - d.pendingAmount / d.amount) * 100)
                : null;
            return (
              <div
                key={d.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <span className={`block h-1 ${isDiscount ? "bg-purple-400" : "bg-amber-400"}`} />
                <div className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          isDiscount ? "text-purple-600" : "text-amber-600"
                        }`}
                      >
                        {isDiscount ? "Solicitud de descuento" : "Solicitud de pérdida"}
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        <Link href={`/pipeline/${d.id}`} className="hover:underline">
                          {d.title}
                        </Link>
                      </p>
                      <p className="text-sm text-slate-500">
                        {d.contact && (
                          <>
                            <Link
                              href={`/contactos/${d.contact.id}`}
                              className="text-teal-600 hover:underline"
                            >
                              {d.contact.firstName} {d.contact.lastName}
                            </Link>
                            {d.company && ` · ${d.company.name}`}
                            {" · "}
                          </>
                        )}
                        Etapa: {d.stage.name}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {d.pendingAt ? dateFmt.format(d.pendingAt) : ""}
                    </span>
                  </div>

                  {isDiscount && (
                    <div className="flex items-center gap-3 rounded-lg bg-purple-50 p-3 text-sm">
                      <span className="text-slate-500 line-through">{money.format(d.amount)}</span>
                      <span className="text-lg">→</span>
                      <span className="font-bold text-purple-700">
                        {money.format(d.pendingAmount ?? 0)}
                      </span>
                      {pct != null && (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                          -{pct}%
                        </span>
                      )}
                    </div>
                  )}

                  <div className="rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="text-slate-700">
                      <span className="font-medium">Motivo:</span>{" "}
                      {d.pendingReason ?? "Sin especificar"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Solicitado por {d.pendingBy?.name ?? "vendedor"}
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                    <form action={rejectRequest}>
                      <input type="hidden" name="dealId" value={d.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        Rechazar
                      </button>
                    </form>
                    <form action={approveRequest}>
                      <input type="hidden" name="dealId" value={d.id} />
                      <button
                        type="submit"
                        className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors ${
                          isDiscount
                            ? "bg-purple-600 hover:bg-purple-700"
                            : "bg-red-500 hover:bg-red-600"
                        }`}
                      >
                        {isDiscount ? "Aprobar descuento" : "Aprobar pérdida"}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
