// Plan de servicios y servicios individuales — vocabulario del dominio.
// Módulo puro (sin Prisma ni Next): lo usan las server actions, las páginas y
// las pruebas. Mismo patrón que lib/clientes.ts.

import { formatMonto } from "./clientes";

// ── Plan de servicios ───────────────────────────────────────────────────────

export const ESTADOS_PLAN = ["activo", "pausado", "cancelado"] as const;
export type EstadoPlan = (typeof ESTADOS_PLAN)[number];

export const estadoPlanLabels: Record<string, string> = {
  activo: "Activo",
  pausado: "Pausado",
  cancelado: "Cancelado",
};

export const estadoPlanClass: Record<string, string> = {
  activo: "bg-emerald-50 text-emerald-700",
  pausado: "bg-amber-50 text-amber-700",
  cancelado: "bg-slate-100 text-slate-500",
};

export function esEstadoPlan(v: string | null | undefined): v is EstadoPlan {
  return !!v && (ESTADOS_PLAN as readonly string[]).includes(v);
}

// Solo el plan activo genera casos recurrentes (F4) y factura (F6). El pausado
// conserva su configuración sin producir trabajo; el cancelado es historia.
export function planProduceTrabajo(estado: string | null | undefined): boolean {
  return estado === "activo";
}

// ── Servicios individuales ──────────────────────────────────────────────────

// El orden ES el flujo: cada estado avanza al siguiente.
export const ESTADOS_SERVICIO = [
  "cotizado",
  "aprobado",
  "en_ejecucion",
  "entregado",
  "facturado",
] as const;
export type EstadoServicio = (typeof ESTADOS_SERVICIO)[number];

export const estadoServicioLabels: Record<string, string> = {
  cotizado: "Cotizado",
  aprobado: "Aprobado",
  en_ejecucion: "En ejecución",
  entregado: "Entregado",
  facturado: "Facturado",
};

export const estadoServicioClass: Record<string, string> = {
  cotizado: "bg-slate-100 text-slate-600",
  aprobado: "bg-blue-50 text-blue-700",
  en_ejecucion: "bg-amber-50 text-amber-700",
  entregado: "bg-teal-50 text-teal-700",
  facturado: "bg-emerald-50 text-emerald-700",
};

export function esEstadoServicio(v: string | null | undefined): v is EstadoServicio {
  return !!v && (ESTADOS_SERVICIO as readonly string[]).includes(v);
}

// Siguiente paso del flujo, o null si ya está facturado.
export function siguienteEstadoServicio(estado: string): EstadoServicio | null {
  const i = (ESTADOS_SERVICIO as readonly string[]).indexOf(estado);
  if (i < 0 || i === ESTADOS_SERVICIO.length - 1) return null;
  return ESTADOS_SERVICIO[i + 1];
}

// El servicio entregado ya se puede cobrar: es el disparador de la factura (F6).
export function servicioFacturable(estado: string | null | undefined): boolean {
  return estado === "entregado";
}

// ── Totales ─────────────────────────────────────────────────────────────────

export type MontoAgrupado = { moneda: string; total: number };

// Suma por moneda: un cliente puede tener el plan en USD y un servicio en Bs,
// y sumarlos en un solo número sería mentir.
export function totalPorMoneda(items: { moneda: string; monto: number }[]): MontoAgrupado[] {
  const mapa = new Map<string, number>();
  for (const i of items) {
    mapa.set(i.moneda, (mapa.get(i.moneda) ?? 0) + i.monto);
  }
  return [...mapa.entries()]
    .map(([moneda, total]) => ({ moneda, total }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda));
}

export function formatTotales(totales: MontoAgrupado[]): string {
  if (totales.length === 0) return formatMonto(0, "USD");
  return totales.map((t) => formatMonto(t.total, t.moneda)).join(" + ");
}
