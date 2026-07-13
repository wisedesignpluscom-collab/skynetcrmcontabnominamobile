// Panel de desglose de la salud del cliente (posventa) para la ficha de contacto.
// Presentacional: recibe el resultado ya calculado (lib/health.ts → getHealth).

import type { HealthResult, HealthBand } from "@/lib/health";

const bandMeta: Record<HealthBand, { label: string; text: string; bg: string; ring: string }> = {
  verde: { label: "Sano", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  amarillo: { label: "Atención", text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200" },
  rojo: { label: "En riesgo", text: "text-red-700", bg: "bg-red-50", ring: "ring-red-200" },
};

function barColor(ratio: number): string {
  if (ratio >= 0.8) return "bg-emerald-500";
  if (ratio >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

export default function HealthPanel({ health }: { health: HealthResult }) {
  const m = bandMeta[health.band];
  const concerns = health.factors.filter((f) => f.concern);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Salud del cliente</h2>
          <p className="text-xs text-slate-400">Qué tan sana está la relación de posventa</p>
        </div>
        <div className={`flex flex-col items-center rounded-xl px-4 py-2 ring-1 ${m.bg} ${m.ring}`}>
          <span className={`text-2xl font-bold leading-none ${m.text}`}>{health.score}</span>
          <span className={`mt-0.5 text-[11px] font-semibold uppercase tracking-wide ${m.text}`}>
            {m.label}
          </span>
        </div>
      </div>

      {/* Barras por factor */}
      <div className="mt-4 space-y-2.5">
        {health.factors.map((f) => {
          const ratio = f.max ? f.points / f.max : 0;
          return (
            <div key={f.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">{f.label}</span>
                <span className="text-slate-400">
                  {f.points}/{f.max}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <span
                  className={`block h-full rounded-full ${barColor(ratio)}`}
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <p className={`mt-0.5 text-[11px] ${f.concern ? "text-red-500" : "text-slate-400"}`}>
                {f.note}
              </p>
            </div>
          );
        })}
      </div>

      {/* Qué atender */}
      {concerns.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-semibold text-amber-800">Qué atender</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-700">
            {concerns.map((f) => (
              <li key={f.key}>{f.note}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
