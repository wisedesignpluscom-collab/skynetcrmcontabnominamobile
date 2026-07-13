"use client";

// Panel (admin, en /configuracion) para ajustar los PESOS de cada factor del
// Health Score y los UMBRALES de las bandas. Al guardar, se recalcula la cartera.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveHealthScoreConfig,
  resetHealthScoreConfig,
} from "@/app/(crm)/configuracion/health-actions";

const inputClass =
  "w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const factorDefs = [
  { key: "satisfaccion", label: "Satisfacción" },
  { key: "contacto", label: "Puntualidad de contacto" },
  { key: "recencia", label: "Recencia de interacción" },
  { key: "tareas", label: "Tareas al día" },
  { key: "antiguedad", label: "Lealtad (antigüedad)" },
] as const;

export type HealthConfigView = {
  weights: Record<(typeof factorDefs)[number]["key"], number>;
  thresholds: { verde: number; amarillo: number };
};

export default function HealthScoreSettings({ initial }: { initial: HealthConfigView }) {
  const router = useRouter();
  const [weights, setWeights] = useState<Record<string, string>>(
    Object.fromEntries(factorDefs.map((f) => [f.key, String(initial.weights[f.key])]))
  );
  const [verde, setVerde] = useState(String(initial.thresholds.verde));
  const [amarillo, setAmarillo] = useState(String(initial.thresholds.amarillo));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [resetting, startReset] = useTransition();

  const total = factorDefs.reduce((s, f) => s + (Number(weights[f.key]) || 0), 0);

  function save() {
    setMsg(null);
    startSaving(async () => {
      const r = await saveHealthScoreConfig({
        weights: {
          satisfaccion: weights.satisfaccion,
          contacto: weights.contacto,
          recencia: weights.recencia,
          tareas: weights.tareas,
          antiguedad: weights.antiguedad,
        },
        thresholds: { verde, amarillo },
      });
      if (r.ok) {
        setMsg({ ok: true, text: "Configuración guardada. La cartera se recalculó." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? "No se pudo guardar." });
      }
    });
  }

  function reset() {
    if (!confirm("¿Restaurar los pesos y umbrales por defecto?")) return;
    setMsg(null);
    startReset(async () => {
      const r = await resetHealthScoreConfig();
      if (r.ok) {
        setWeights({ satisfaccion: "35", contacto: "25", recencia: "20", tareas: "12", antiguedad: "8" });
        setVerde("70");
        setAmarillo("45");
        setMsg({ ok: true, text: "Valores por defecto restaurados." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? "No se pudo restaurar." });
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Health Score (salud del cliente)</h2>
      <p className="mb-4 text-xs text-slate-400">
        Ajusta cuánto pesa cada factor en el puntaje de salud de posventa y en qué puntaje empieza
        cada banda del semáforo. Al guardar, se recalcula toda la cartera.
      </p>

      {/* Pesos */}
      <div className="rounded-lg border border-slate-100 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600">Pesos de los factores</p>
          <p className={`text-xs font-semibold ${total === 100 ? "text-emerald-600" : "text-amber-600"}`}>
            Suma: {total} {total === 100 ? "✓" : "(ideal: 100)"}
          </p>
        </div>
        <div className="space-y-2">
          {factorDefs.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>{f.label}</span>
              <input
                type="number"
                min={0}
                value={weights[f.key]}
                onChange={(e) => setWeights((w) => ({ ...w, [f.key]: e.target.value }))}
                className={inputClass}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Umbrales */}
      <div className="mt-3 rounded-lg border border-slate-100 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-600">Umbrales de banda (0-100)</p>
        <div className="space-y-2 text-sm text-slate-600">
          <label className="flex items-center justify-between gap-3">
            <span>🟢 Sano: puntaje ≥</span>
            <input
              type="number"
              min={0}
              max={100}
              value={verde}
              onChange={(e) => setVerde(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>🟡 Atención: puntaje ≥</span>
            <input
              type="number"
              min={0}
              max={100}
              value={amarillo}
              onChange={(e) => setAmarillo(e.target.value)}
              className={inputClass}
            />
          </label>
          <p className="text-[11px] text-slate-400">🔴 Riesgo: por debajo del umbral de Atención.</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || resetting}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar y recalcular"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving || resetting}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          {resetting ? "Restaurando…" : "Restaurar por defecto"}
        </button>
      </div>

      {msg && (
        <p
          className={`mt-3 rounded-lg border p-2 text-xs ${
            msg.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
