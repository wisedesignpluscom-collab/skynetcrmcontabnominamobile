// Caso recurrente — vocabulario del dominio (módulo puro, sin Prisma ni Next).
// El caso es la unidad de trabajo de la firma: una obligación de un cliente en
// un período fiscal concreto.

// El orden ES el ciclo de vida. «vencido» queda fuera del arreglo a propósito:
// no es un paso más del flujo, es el estado en que cae un caso que pasó su
// fecha límite sin presentarse.
export const ESTADOS_CASO = [
  "pendiente_cliente",
  "en_proceso",
  "en_revision",
  "presentado",
] as const;
export type EstadoCaso = (typeof ESTADOS_CASO)[number] | "vencido";

export const ESTADO_VENCIDO = "vencido";

export const estadoCasoLabels: Record<string, string> = {
  pendiente_cliente: "Esperando al cliente",
  en_proceso: "En proceso",
  en_revision: "En revisión",
  presentado: "Presentado",
  vencido: "Vencido",
};

export const estadoCasoClass: Record<string, string> = {
  pendiente_cliente: "bg-slate-100 text-slate-600",
  en_proceso: "bg-blue-50 text-blue-700",
  en_revision: "bg-amber-50 text-amber-700",
  presentado: "bg-emerald-50 text-emerald-700",
  vencido: "bg-red-50 text-red-700",
};

export function esEstadoCaso(v: string | null | undefined): v is EstadoCaso {
  return !!v && ((ESTADOS_CASO as readonly string[]).includes(v) || v === ESTADO_VENCIDO);
}

// Un caso presentado está cerrado: ya no se le pide nada al cliente ni vence.
export function casoCerrado(estado: string | null | undefined): boolean {
  return estado === "presentado";
}

// Siguiente paso del ciclo. Un caso vencido vuelve al flujo por «en_proceso»:
// vencerse no exime de presentar, y el atraso queda registrado en causaAtraso.
export function siguienteEstadoCaso(estado: string): EstadoCaso | null {
  if (estado === ESTADO_VENCIDO) return "en_proceso";
  const i = (ESTADOS_CASO as readonly string[]).indexOf(estado);
  if (i < 0 || i === ESTADOS_CASO.length - 1) return null;
  return ESTADOS_CASO[i + 1];
}

// ── Causas de atraso ────────────────────────────────────────────────────────

export const CAUSAS_ATRASO = ["cliente", "interno", "externo"] as const;

export const causaAtrasoLabels: Record<string, string> = {
  cliente: "El cliente no entregó a tiempo",
  interno: "Atraso interno de la firma",
  externo: "Causa externa (portal caído, feriado decretado…)",
};

export function esCausaAtraso(v: string | null | undefined): boolean {
  return !!v && (CAUSAS_ATRASO as readonly string[]).includes(v);
}

// ── Semáforo por proximidad al vencimiento ──────────────────────────────────

export type Semaforo = "presentado" | "vencido" | "hoy" | "urgente" | "proximo" | "tranquilo" | "sin_fecha";

export const semaforoClass: Record<Semaforo, string> = {
  presentado: "bg-emerald-500",
  vencido: "bg-red-600",
  hoy: "bg-red-400",
  urgente: "bg-amber-500",
  proximo: "bg-yellow-400",
  tranquilo: "bg-slate-300",
  sin_fecha: "bg-slate-200",
};

export const semaforoLabels: Record<Semaforo, string> = {
  presentado: "Presentado",
  vencido: "Vencido",
  hoy: "Vence hoy",
  urgente: "Vence en 3 días o menos",
  proximo: "Vence esta semana y media",
  tranquilo: "Con holgura",
  sin_fecha: "Sin fecha límite",
};

// Días completos entre hoy y la fecha límite (negativo = ya pasó). Compara por
// día calendario, no por horas: un caso que vence hoy a las 8am no está vencido.
export function diasHasta(fechaLimite: Date, hoy = new Date()): number {
  const a = new Date(fechaLimite.getFullYear(), fechaLimite.getMonth(), fechaLimite.getDate());
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export function semaforoCaso(
  fechaLimite: Date | null | undefined,
  estado: string,
  hoy = new Date()
): Semaforo {
  if (casoCerrado(estado)) return "presentado";
  if (!fechaLimite) return "sin_fecha";
  const dias = diasHasta(fechaLimite, hoy);
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoy";
  if (dias <= 3) return "urgente";
  if (dias <= 10) return "proximo";
  return "tranquilo";
}

// Un caso está vencido cuando su fecha límite ya pasó y no se presentó. Lo usa
// el barrido que marca los vencidos y emite «caso.vencido».
export function debeMarcarseVencido(
  fechaLimite: Date | null | undefined,
  estado: string,
  hoy = new Date()
): boolean {
  if (!fechaLimite) return false;
  if (casoCerrado(estado) || estado === ESTADO_VENCIDO) return false;
  return diasHasta(fechaLimite, hoy) < 0;
}
