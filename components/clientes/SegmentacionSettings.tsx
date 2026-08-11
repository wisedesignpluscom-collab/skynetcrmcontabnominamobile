// Panel de Configuración de la matriz de segmentación (Etapa 4 «Mis
// Consultores»): umbrales de rentabilidad (por moneda, nunca se convierte una
// a otra) y de incumplimiento. Mismo patrón que NominaRiesgoSettings.tsx.

import {
  saveConfigSegmentacion,
  restaurarConfigSegmentacionPorDefecto,
} from "@/app/(crm)/configuracion/segmentacion-actions";
import { CATEGORIAS_SEGMENTO, type ConfigSegmentacion } from "@/lib/segmentacion";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default function SegmentacionSettings({ config }: { config: ConfigSegmentacion }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Segmentación de clientes</h2>
      <p className="mb-4 text-xs text-slate-400">
        Cada cliente se clasifica por rentabilidad (honorario del plan activo) × cumplimiento
        (casos abiertos vencidos o estancados). El honorario se compara contra el umbral de SU
        PROPIA moneda — nunca se convierte Bs a USD.
      </p>

      <ul className="mb-5 grid gap-2 sm:grid-cols-2">
        {Object.entries(CATEGORIAS_SEGMENTO).map(([key, info]) => (
          <li
            key={key}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${info.clase}`}
          >
            <span className="font-semibold">{info.label}</span> — {info.descripcion}
          </li>
        ))}
      </ul>

      <form action={saveConfigSegmentacion} className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Rentable desde (USD)
          <input
            name="umbralRentabilidadUsd"
            type="number"
            min="1"
            step="any"
            defaultValue={config.umbralRentabilidadUsd}
            required
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Rentable desde (Bs)
          <input
            name="umbralRentabilidadBs"
            type="number"
            min="1"
            step="any"
            defaultValue={config.umbralRentabilidadBs}
            required
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Mal cumplimiento desde (%)
          <input
            name="umbralIncumplimiento"
            type="number"
            min="1"
            max="99"
            step="1"
            defaultValue={Math.round(config.umbralIncumplimiento * 100)}
            required
            className={inputClass}
          />
        </label>
        <div className="flex items-center gap-2 sm:col-span-3">
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Guardar
          </button>
          <span className="text-xs text-slate-400">
            % de casos abiertos vencidos/estancados a partir del cual el cumplimiento se considera
            malo.
          </span>
        </div>
      </form>

      <form action={restaurarConfigSegmentacionPorDefecto} className="mt-2">
        <button type="submit" className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline">
          Restaurar valores por defecto
        </button>
      </form>
    </section>
  );
}
