import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { updateFollowUp } from "./actions";
import WhatsAppButton from "@/components/WhatsAppButton";
import { hasValidPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
});

const stageMeta: Record<
  string,
  { label: string; color: string; bar: string; hint: string }
> = {
  onboarding: {
    label: "Onboarding",
    color: "text-blue-700 bg-blue-50",
    bar: "bg-blue-500",
    hint: "Clientes recién ganados: bienvenida y puesta en marcha.",
  },
  seguimiento: {
    label: "Seguimiento activo",
    color: "text-teal-700 bg-teal-50",
    bar: "bg-teal-500",
    hint: "Contacto periódico para asegurar satisfacción y detectar nuevas ventas.",
  },
  fidelizado: {
    label: "Fidelizado",
    color: "text-emerald-700 bg-emerald-50",
    bar: "bg-emerald-500",
    hint: "Clientes recurrentes y satisfechos: cuidarlos y pedir referidos.",
  },
  riesgo: {
    label: "En riesgo",
    color: "text-red-700 bg-red-50",
    bar: "bg-red-500",
    hint: "Señales de insatisfacción: actuar pronto para no perderlos.",
  },
};

const stageOrder = ["onboarding", "seguimiento", "fidelizado", "riesgo"];

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

function Stars({ value }: { value: number | null }) {
  if (!value) return <span className="text-xs text-slate-400">Sin calificar</span>;
  return (
    <span className="text-sm text-amber-500" title={`Satisfacción: ${value}/5`}>
      {"★".repeat(value)}
      <span className="text-slate-200">{"★".repeat(5 - value)}</span>
    </span>
  );
}

export default async function PosventaPage() {
  const followUps = await prisma.followUp.findMany({
    include: { contact: true, deal: true },
    orderBy: { nextContactDate: "asc" },
  });

  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const dueSoon = followUps.filter(
    (f) => f.nextContactDate && f.nextContactDate <= weekAhead
  );
  const atRisk = followUps.filter((f) => f.stage === "riesgo");
  const totalValue = followUps.reduce((s, f) => s + f.deal.amount, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Posventa</h1>
        <p className="text-sm text-slate-500">
          Seguimiento de clientes después de la venta — el camino al cliente recurrente.
        </p>
      </header>

      {/* KPIs */}
      <section className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Clientes en posventa</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {followUps.length}
            <span className="ml-2 text-sm font-medium text-slate-400">
              {money.format(totalValue)} en ventas
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Contactar esta semana</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{dueSoon.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">En riesgo</p>
          <p className="mt-1 text-xl font-bold text-red-600">{atRisk.length}</p>
        </div>
      </section>

      {followUps.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
          Aún no hay clientes en posventa. Cuando ganes una oportunidad en el{" "}
          <Link href="/pipeline" className="text-teal-600 hover:underline">
            pipeline
          </Link>
          , el cliente entrará aquí automáticamente.
        </p>
      )}

      {/* Columnas por etapa */}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {stageOrder.map((stageKey) => {
          const meta = stageMeta[stageKey];
          const items = followUps.filter((f) => f.stage === stageKey);
          return (
            <section key={stageKey} className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs font-medium text-slate-500">{items.length}</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">{meta.hint}</p>
              </div>

              {items.map((f) => {
                const overdue = f.nextContactDate && f.nextContactDate < now;
                return (
                  <div
                    key={f.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    <span className={`block h-1 ${meta.bar}`} />
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/contactos/${f.contactId}`}
                            className="block truncate text-sm font-semibold text-slate-800 hover:text-teal-700"
                          >
                            {f.contact.firstName} {f.contact.lastName}
                          </Link>
                          <p className="truncate text-xs text-slate-500">
                            {f.deal.title} · {money.format(f.deal.amount)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Stars value={f.satisfaction} />
                          {hasValidPhone(f.contact.phone) && (
                            <WhatsAppButton
                              compact
                              phone={f.contact.phone}
                              message={`Hola ${f.contact.firstName}, ¿cómo te ha ido con "${f.deal.title}"? Quería saber si todo va bien y si necesitas algo.`}
                            />
                          )}
                        </div>
                      </div>

                      <p
                        className={`text-xs font-medium ${
                          overdue ? "text-red-600" : "text-slate-500"
                        }`}
                      >
                        Próximo contacto:{" "}
                        {f.nextContactDate ? dateFmt.format(f.nextContactDate) : "sin programar"}
                        {overdue && " · ¡vencido!"}
                      </p>

                      {/* Actualizar seguimiento */}
                      <form action={updateFollowUp} className="space-y-2 border-t border-slate-100 pt-3">
                        <input type="hidden" name="followUpId" value={f.id} />
                        <div className="grid grid-cols-2 gap-2">
                          <select name="stage" defaultValue={f.stage} className={inputClass}>
                            {stageOrder.map((s) => (
                              <option key={s} value={s}>
                                {stageMeta[s].label}
                              </option>
                            ))}
                          </select>
                          <select
                            name="satisfaction"
                            defaultValue={f.satisfaction ?? ""}
                            className={inputClass}
                          >
                            <option value="">Satisfacción…</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {"★".repeat(n)} ({n}/5)
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="date"
                          name="nextContactDate"
                          defaultValue={
                            f.nextContactDate
                              ? f.nextContactDate.toISOString().slice(0, 10)
                              : ""
                          }
                          className={inputClass}
                        />
                        <div className="flex gap-2">
                          <input
                            name="note"
                            placeholder="Nota del contacto (opcional)…"
                            className={inputClass}
                          />
                          <button
                            type="submit"
                            className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
                          >
                            Guardar
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
