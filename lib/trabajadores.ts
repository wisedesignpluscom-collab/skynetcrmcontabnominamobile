// Ficha del trabajador (Etapa 2.2) — vocabulario del contrato, sin Prisma ni
// Next. Mismo patrón que lib/nomina.ts / lib/planes.ts.

export const TIPOS_CONTRATO = ["indefinido", "determinado", "obra_determinada"] as const;
export type TipoContrato = (typeof TIPOS_CONTRATO)[number];

export const tipoContratoLabels: Record<string, string> = {
  indefinido: "Tiempo indeterminado",
  determinado: "Tiempo determinado",
  obra_determinada: "Para una obra determinada",
};

export function esTipoContrato(v: string | null | undefined): v is TipoContrato {
  return !!v && (TIPOS_CONTRATO as readonly string[]).includes(v);
}
