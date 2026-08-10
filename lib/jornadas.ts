// Configuración de nómina (Etapa 2.3) — vocabulario y aritmética de jornadas.
// Módulo puro, sin Prisma ni Next (mismo patrón que lib/fiscal/vencimientos.ts).

export const FRECUENCIAS_PAGO = ["mensual", "quincenal", "semanal"] as const;
export type FrecuenciaPago = (typeof FRECUENCIAS_PAGO)[number];

export const frecuenciaPagoLabels: Record<string, string> = {
  mensual: "Mensual",
  quincenal: "Quincenal (1-15 / 16-fin)",
  semanal: "Semanal",
};

export function esFrecuenciaPago(v: string | null | undefined): v is FrecuenciaPago {
  return !!v && (FRECUENCIAS_PAGO as readonly string[]).includes(v);
}

export const METODOS_JORNADA = ["fija", "otro"] as const;
export type MetodoJornada = (typeof METODOS_JORNADA)[number];

export const metodoJornadaLabels: Record<string, string> = {
  fija: "Fija",
  otro: "Otro",
};

// L-M-X-J-V-S-D — se usa X para miércoles (no M) para no chocar con martes,
// convención habitual de calendario en español.
export const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

export const diaSemanaLabels: Record<string, string> = {
  L: "Lunes",
  M: "Martes",
  X: "Miércoles",
  J: "Jueves",
  V: "Viernes",
  S: "Sábado",
  D: "Domingo",
};

export const PRESETS_DIAS: Record<string, DiaSemana[]> = {
  "L-V": ["L", "M", "X", "J", "V"],
  "L-S": ["L", "M", "X", "J", "V", "S"],
  Todos: ["L", "M", "X", "J", "V", "S", "D"],
};

// "HH:mm" → minutos desde medianoche. Entrada inválida → null (nunca se inventa una hora).
export function minutosDesde(hhmm: string | null | undefined): number | null {
  const m = hhmm?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return horas * 60 + minutos;
}

// Horas efectivas = (salida - entrada) - descanso, cruzando medianoche si la
// salida es antes que la entrada (jornada nocturna). Nunca negativo.
export function horasEfectivas(
  horaEntrada: string | null | undefined,
  horaSalida: string | null | undefined,
  descansoMinutos: number
): number | null {
  const inicio = minutosDesde(horaEntrada);
  const fin = minutosDesde(horaSalida);
  if (inicio == null || fin == null) return null;
  let total = fin - inicio;
  if (total <= 0) total += 24 * 60;
  total -= descansoMinutos || 0;
  return Math.max(0, total) / 60;
}
