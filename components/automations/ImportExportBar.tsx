"use client";

// Import/export de automatizaciones entre ambientes (Fase 6). Exportar descarga
// un JSON portable (etapas por nombre); importar pega ese JSON. Reutiliza el
// patrón visual de tarjetas del CRM; sin dependencias nuevas.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { exportAutomations, importAutomations } from "@/app/(crm)/automatizaciones/actions";
import type { ImportSummary } from "@/lib/engine/portable";

export default function ImportExportBar({ canImport }: { canImport: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, start] = useTransition();

  function doExport() {
    start(async () => {
      const json = await exportAutomations();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `automatizaciones-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function doImport() {
    setSummary(null);
    start(async () => {
      const result = await importAutomations(raw);
      setSummary(result);
      if (result.ok) {
        setRaw("");
        router.refresh();
      }
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setRaw);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Mover reglas entre ambientes</h2>
          <p className="text-xs text-slate-400">
            Exporta las automatizaciones a un archivo y vuélvelas a importar en otro ambiente
            (las etapas se enlazan por nombre).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={doExport}
            disabled={busy}
            className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50"
          >
            ↓ Exportar
          </button>
          {canImport && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
            >
              ↑ Importar
            </button>
          )}
        </div>
      </div>

      {open && canImport && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          <input type="file" accept="application/json,.json" onChange={onFile} className="text-xs" />
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            placeholder="…o pega aquí el JSON exportado"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={doImport}
              disabled={busy || !raw.trim()}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              {busy ? "Importando…" : "Importar reglas"}
            </button>
            <span className="text-[11px] text-slate-400">
              Empareja por nombre: reemplaza las que existan, crea las nuevas.
            </span>
          </div>

          {summary && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                summary.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
              }`}
            >
              {summary.error ? (
                <p className="text-red-600">{summary.error}</p>
              ) : (
                <ul className="space-y-0.5 text-slate-600">
                  <li>✅ Creadas: {summary.created.length}{summary.created.length ? ` (${summary.created.join(", ")})` : ""}</li>
                  <li>♻️ Actualizadas: {summary.updated.length}{summary.updated.length ? ` (${summary.updated.join(", ")})` : ""}</li>
                  {summary.skipped.length > 0 && (
                    <li className="text-amber-700">
                      ⚠️ Omitidas: {summary.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
