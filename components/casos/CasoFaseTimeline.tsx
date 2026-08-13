// Checklist de fases de UN caso: línea de tiempo con lo completado (tachado,
// con autor/fecha/reabrir) y el mini-formulario ámbar de la fase activa. El
// servidor es quien impide saltarse un paso (fase-actions.ts); esta UI solo
// refleja ese estado — no hay botón de "completar" para una fase que no es
// la activa.

import { completarFase, reabrirFase } from "@/app/(crm)/casos/fase-actions";
import type { CampoFase } from "@/lib/fases";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const fechaHora = (d: Date) =>
  d.toLocaleString("es-VE", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export type FaseTimelineItem = {
  id: string;
  order: number;
  nombre: string;
  descripcion: string | null;
  campos: CampoFase[];
  completada: boolean;
  completedAt: Date | null;
  completedByNombre: string | null;
  valores: Record<string, string>;
};

function CampoInput({ campo, defaultValue }: { campo: CampoFase; defaultValue: string }) {
  const tipoInput = campo.tipo === "numero" ? "number" : campo.tipo === "fecha" ? "date" : campo.tipo === "url" ? "url" : "text";
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {campo.label}
        {campo.requerido && " *"}
      </span>
      <input
        name={`campo_${campo.id}`}
        type={tipoInput}
        required={campo.requerido}
        defaultValue={defaultValue}
        placeholder={campo.tipo === "numero" ? "Monto" : campo.tipo === "url" ? "https://…" : undefined}
        className={`${inputClass} w-full`}
      />
    </label>
  );
}

export default function CasoFaseTimeline({
  casoId,
  fases,
  puedeReabrir,
}: {
  casoId: string;
  fases: FaseTimelineItem[];
  puedeReabrir: boolean;
}) {
  if (fases.length === 0) return null;

  const completadas = fases.filter((f) => f.completada).length;
  const activa = fases.find((f) => !f.completada) ?? null;

  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Línea de tiempo — {completadas}/{fases.length} fases completadas
      </p>

      <ol className="space-y-1">
        {fases.map((fase) => (
          <li key={fase.id} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                fase.completada ? "bg-emerald-500" : "border border-slate-300"
              }`}
            />
            {fase.completada ? (
              <div className="text-slate-500">
                <span className="line-through">{fase.nombre}</span>
                {" — "}
                {fase.completedByNombre ?? "—"} · {fase.completedAt && fechaHora(fase.completedAt)}
                {puedeReabrir && (
                  <form action={reabrirFase} className="ml-2 inline">
                    <input type="hidden" name="casoId" value={casoId} />
                    <input type="hidden" name="faseId" value={fase.id} />
                    <button type="submit" className="text-xs text-slate-400 underline hover:text-red-600">
                      reabrir
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <span className={fase.id === activa?.id ? "font-medium text-slate-700" : "text-slate-400"}>
                {fase.nombre}
              </span>
            )}
          </li>
        ))}
      </ol>

      {activa && (
        <form
          action={completarFase}
          className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3"
        >
          <input type="hidden" name="casoId" value={casoId} />
          <input type="hidden" name="faseId" value={activa.id} />
          <p className="font-semibold text-slate-800">{activa.nombre}</p>
          {activa.descripcion && <p className="text-xs text-slate-500">{activa.descripcion}</p>}
          {activa.campos.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {activa.campos.map((campo) => (
                <CampoInput key={campo.id} campo={campo} defaultValue={activa.valores[campo.id] ?? ""} />
              ))}
            </div>
          )}
          <button
            type="submit"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Completar esta fase
          </button>
        </form>
      )}
    </div>
  );
}
