"use client";

// Historial de versiones de una regla (Fase 6): lista de cambios auditados con
// autor y fecha, y botón de restaurar (rollback). El rollback reescribe la regla
// con el snapshot elegido y agrega una versión "restored" — no borra historial.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreAutomationVersion } from "@/app/(crm)/automatizaciones/actions";
import { VERSION_ACTION_LABELS, type VersionEntry } from "@/lib/engine/versions";

const actionStyle: Record<string, string> = {
  created: "bg-emerald-50 text-emerald-700",
  updated: "bg-sky-50 text-sky-700",
  activated: "bg-emerald-50 text-emerald-700",
  deactivated: "bg-slate-100 text-slate-500",
  restored: "bg-amber-50 text-amber-700",
  imported: "bg-violet-50 text-violet-700",
};

export default function HistoryPanel({
  ruleId,
  versions,
  canRestore,
}: {
  ruleId: string;
  versions: VersionEntry[];
  canRestore: boolean;
}) {
  const router = useRouter();
  const [busy, startRestore] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function restore(versionId: string, version: number) {
    setError(null);
    if (!confirm(`¿Restaurar la versión ${version}? La regla volverá a ese estado (queda registrado).`))
      return;
    startRestore(async () => {
      const result = await restoreAutomationVersion(ruleId, versionId);
      if (result.ok) router.refresh();
      else setError(result.errors[0] ?? "No se pudo restaurar.");
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Historial de cambios</h2>
      <p className="mb-3 text-xs text-slate-400">
        Cada cambio queda registrado con su autor. Puedes volver a una versión anterior.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600">
          {error}
        </p>
      )}

      {versions.length === 0 ? (
        <p className="py-3 text-center text-xs text-slate-400">Sin cambios registrados aún.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {versions.map((v, i) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="w-8 text-xs font-semibold text-slate-400">v{v.version}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  actionStyle[v.action] ?? "bg-slate-100 text-slate-500"
                }`}
              >
                {VERSION_ACTION_LABELS[v.action] ?? v.action}
              </span>
              <div className="min-w-40 flex-1">
                <p className="text-xs text-slate-600">{v.authorName ?? "—"}</p>
                <p className="text-[11px] text-slate-400">
                  {new Date(v.createdAt).toLocaleString("es-VE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {i === 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-400">
                  Actual
                </span>
              ) : (
                canRestore && (
                  <button
                    type="button"
                    onClick={() => restore(v.id, v.version)}
                    disabled={busy}
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-amber-100 hover:text-amber-700 disabled:opacity-50"
                  >
                    Restaurar
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
