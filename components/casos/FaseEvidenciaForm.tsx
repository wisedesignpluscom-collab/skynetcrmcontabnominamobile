"use client";

// Formulario de evidencia de UNA sub-fase (Etapa 3 «Mis Consultores»): campos
// de resultado reales, generados desde ObligacionFase.campos — nunca un
// simple "¿lo hiciste? Sí/No". Cliente porque necesita mostrar los errores de
// guardarEvidenciaFase con useActionState (mismo patrón que ContactoNuevoForm).

import { useActionState } from "react";
import { guardarEvidenciaFase } from "@/app/(crm)/casos/fases-actions";
import { tipoCampoEvidenciaLabels, type EvidenciaCampoSpec } from "@/lib/casos-fases";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

function inputTypeFor(tipo: EvidenciaCampoSpec["tipo"]): string {
  if (tipo === "numero" || tipo === "moneda") return "number";
  if (tipo === "fecha") return "date";
  if (tipo === "archivo_url") return "url";
  return "text";
}

export default function FaseEvidenciaForm({
  casoFaseId,
  nombre,
  ayuda,
  campos,
}: {
  casoFaseId: string;
  nombre: string;
  ayuda?: string | null;
  campos: EvidenciaCampoSpec[];
}) {
  const [state, formAction, pending] = useActionState(guardarEvidenciaFase, undefined);

  return (
    <form action={formAction} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <input type="hidden" name="casoFaseId" value={casoFaseId} />
      <p className="mb-1 text-sm font-semibold text-slate-800">{nombre}</p>
      {ayuda && <p className="mb-2 text-xs text-slate-500">{ayuda}</p>}

      <div className="grid gap-2 sm:grid-cols-3">
        {campos.map((campo) => (
          <label key={campo.clave} className={campo.tipo === "archivo_url" ? "sm:col-span-3" : undefined}>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {campo.etiqueta}
              {campo.requerido && " *"}
            </span>
            {campo.tipo === "select" ? (
              <select name={`campo_${campo.clave}`} defaultValue="" className={`${inputClass} w-full`}>
                <option value="">Seleccionar…</option>
                {(campo.opciones ?? []).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={`campo_${campo.clave}`}
                type={inputTypeFor(campo.tipo)}
                step={campo.tipo === "moneda" ? "0.01" : undefined}
                placeholder={
                  campo.tipo === "archivo_url" ? "https://…" : tipoCampoEvidenciaLabels[campo.tipo]
                }
                className={`${inputClass} w-full`}
              />
            )}
          </label>
        ))}
      </div>

      {state?.errors && state.errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-700">
          {state.errors.map((e) => (
            <li key={e}>· {e}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Completar esta fase"}
      </button>
    </form>
  );
}
