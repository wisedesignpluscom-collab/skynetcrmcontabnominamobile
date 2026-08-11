// Segmentación de clientes por rentabilidad × cumplimiento — matriz de 4
// categorías (Etapa 4 «Mis Consultores»). Módulo puro (sin Prisma ni Next),
// mismo patrón que lib/health.ts.
//
// Cuadrantes (definición del cliente):
//   Dorado    = alta rentabilidad + buen cumplimiento  → los mejores clientes
//   Azul      = alta rentabilidad + mal cumplimiento   → cuenta grande en riesgo,
//               prioridad de rescate
//   Verde     = baja rentabilidad + buen cumplimiento  → estable, sin drama
//   Amarillo  = baja rentabilidad + mal cumplimiento   → alerta
//
// Rentabilidad y cumplimiento NUNCA se mezclan entre monedas: el honorario se
// compara contra el umbral de SU PROPIA moneda (mismo principio que
// totalPorMoneda en lib/planes.ts — sumar monedas distintas sería mentir; aquí
// tampoco se convierte, se compara cada una contra su propio umbral).

import type { Moneda } from "./clientes";

export type CategoriaSegmento = "dorado" | "azul" | "verde" | "amarillo";

export const CATEGORIAS_SEGMENTO: Record<
  CategoriaSegmento,
  { label: string; clase: string; descripcion: string }
> = {
  dorado: {
    label: "Dorado",
    clase: "bg-amber-50 text-amber-800 border-amber-300",
    descripcion: "Alta rentabilidad y al día con sus obligaciones",
  },
  azul: {
    label: "Azul",
    clase: "bg-blue-50 text-blue-800 border-blue-300",
    descripcion: "Alta rentabilidad pero con atrasos — prioridad de rescate",
  },
  verde: {
    label: "Verde",
    clase: "bg-emerald-50 text-emerald-800 border-emerald-300",
    descripcion: "Rentabilidad menor pero al día — cliente estable",
  },
  amarillo: {
    label: "Amarillo",
    clase: "bg-yellow-50 text-yellow-800 border-yellow-300",
    descripcion: "Rentabilidad menor y con atrasos — alerta",
  },
};

export function esCategoriaSegmento(v: string | null | undefined): v is CategoriaSegmento {
  return !!v && v in CATEGORIAS_SEGMENTO;
}

export type ConfigSegmentacion = {
  umbralRentabilidadUsd: number;
  umbralRentabilidadBs: number;
  // Fracción (0-1) de casos abiertos vencidos/estancados a partir de la cual
  // el cumplimiento se considera malo.
  umbralIncumplimiento: number;
};

// Umbrales referenciales — el admin los ajusta en /configuracion antes de
// confiar la matriz a un cliente real (ver decisión de la Etapa 4).
export const DEFAULT_CONFIG_SEGMENTACION: ConfigSegmentacion = {
  umbralRentabilidadUsd: 300,
  umbralRentabilidadBs: 15000,
  umbralIncumplimiento: 0.2,
};

export type InsumoSegmentacion = {
  // null = sin plan activo (nunca se le atribuye una rentabilidad inventada)
  honorarioMensual: number | null;
  monedaHonorario: Moneda | null;
  casosAbiertos: number;
  // Vencidos + estancados (mutuamente excluyentes: estaEstancado ya descarta
  // el estado "vencido", ver lib/casos.ts).
  casosProblematicos: number;
};

export type ResultadoSegmentacion = {
  categoria: CategoriaSegmento;
  rentable: boolean;
  cumple: boolean;
  motivos: string[];
};

export function esRentable(
  insumo: Pick<InsumoSegmentacion, "honorarioMensual" | "monedaHonorario">,
  config: ConfigSegmentacion = DEFAULT_CONFIG_SEGMENTACION
): boolean {
  if (insumo.honorarioMensual == null || insumo.monedaHonorario == null) return false;
  const umbral =
    insumo.monedaHonorario === "USD" ? config.umbralRentabilidadUsd : config.umbralRentabilidadBs;
  return insumo.honorarioMensual >= umbral;
}

export function cumpleBien(
  insumo: Pick<InsumoSegmentacion, "casosAbiertos" | "casosProblematicos">,
  config: ConfigSegmentacion = DEFAULT_CONFIG_SEGMENTACION
): boolean {
  if (insumo.casosAbiertos <= 0) return true;
  return insumo.casosProblematicos / insumo.casosAbiertos <= config.umbralIncumplimiento;
}

export function calcularSegmento(
  insumo: InsumoSegmentacion,
  config: ConfigSegmentacion = DEFAULT_CONFIG_SEGMENTACION
): ResultadoSegmentacion {
  const rentable = esRentable(insumo, config);
  const cumple = cumpleBien(insumo, config);
  const categoria: CategoriaSegmento = rentable
    ? cumple
      ? "dorado"
      : "azul"
    : cumple
      ? "verde"
      : "amarillo";

  const motivos: string[] = [
    insumo.honorarioMensual == null
      ? "Sin plan de servicios activo"
      : `Honorario ${insumo.honorarioMensual} ${insumo.monedaHonorario} (${
          rentable ? "≥" : "<"
        } umbral de rentabilidad)`,
    insumo.casosAbiertos === 0
      ? "Sin casos abiertos"
      : `${insumo.casosProblematicos} de ${insumo.casosAbiertos} casos abiertos vencidos o estancados`,
  ];

  return { categoria, rentable, cumple, motivos };
}
