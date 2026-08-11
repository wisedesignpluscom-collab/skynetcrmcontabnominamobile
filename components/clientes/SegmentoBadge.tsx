// Medalla de segmentación (Etapa 4 «Mis Consultores») — junto a "Editar" en la
// ficha del cliente. Puramente visual: recibe el resultado ya calculado
// (lib/segmentacionCompany.ts, calculado en vivo por la página, siempre
// fresco) y solo lo pinta. El título muestra los motivos del cálculo, mismo
// criterio de transparencia que "Ver lógica de cálculo" en LOTTT.
import { CATEGORIAS_SEGMENTO, type ResultadoSegmentacion } from "@/lib/segmentacion";

export default function SegmentoBadge({ resultado }: { resultado: ResultadoSegmentacion }) {
  const info = CATEGORIAS_SEGMENTO[resultado.categoria];
  return (
    <span
      title={`${info.descripcion} — ${resultado.motivos.join(" · ")}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2.5 text-sm font-semibold ${info.clase}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path strokeLinecap="round" d="M9 3 7.2 9.5M15 3l1.8 6.5" />
        <circle cx="12" cy="15" r="6" />
        <path
          fill="currentColor"
          stroke="none"
          d="M12 11.7 13 14l2.4.35-1.75 1.7.4 2.4L12 17.3l-2.05 1.15.4-2.4L8.6 14.35 11 14z"
        />
      </svg>
      {info.label}
    </span>
  );
}
