// Facturación — vocabulario del dominio (módulo puro, sin Prisma ni Next).

import { formatMonto } from "./clientes";
import { totalPorMoneda, formatTotales, type MontoAgrupado } from "./planes";

export const TIPOS_FACTURA = ["honorario_fijo", "servicio_individual"] as const;
export type TipoFactura = (typeof TIPOS_FACTURA)[number];

export const tipoFacturaLabels: Record<string, string> = {
  honorario_fijo: "Honorario mensual",
  servicio_individual: "Servicio individual",
};

export const ESTADOS_PAGO = ["pendiente", "pagado", "vencido"] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

export const estadoPagoLabels: Record<string, string> = {
  pendiente: "Por cobrar",
  pagado: "Cobrado",
  vencido: "Vencida",
};

export const estadoPagoClass: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-700",
  pagado: "bg-emerald-50 text-emerald-700",
  vencido: "bg-red-50 text-red-700",
};

export function esTipoFactura(v: string | null | undefined): v is TipoFactura {
  return !!v && (TIPOS_FACTURA as readonly string[]).includes(v);
}

export function esEstadoPago(v: string | null | undefined): v is EstadoPago {
  return !!v && (ESTADOS_PAGO as readonly string[]).includes(v);
}

// Días desde la emisión tras los cuales una factura sin cobrar se da por
// vencida. No es una fecha guardada por factura: la firma cobra a 30 días.
export const DIAS_PARA_VENCER = 30;

export function facturaVencida(
  estadoPago: string,
  fechaEmision: Date,
  hoy = new Date()
): boolean {
  if (estadoPago !== "pendiente") return false;
  const dias = Math.floor((hoy.getTime() - fechaEmision.getTime()) / 86_400_000);
  return dias >= DIAS_PARA_VENCER;
}

// ── Totales ─────────────────────────────────────────────────────────────────

export type FacturaMonto = { moneda: string; monto: number; estadoPago: string };

// Totales por estado, y dentro de cada estado por moneda: sumar USD y Bs en un
// solo número sería mentir (mismo criterio que lib/planes.ts).
export function totalesPorEstado(
  facturas: FacturaMonto[]
): Record<string, MontoAgrupado[]> {
  const salida: Record<string, MontoAgrupado[]> = {};
  for (const estado of ESTADOS_PAGO) {
    salida[estado] = totalPorMoneda(
      facturas.filter((f) => f.estadoPago === estado).map((f) => ({ moneda: f.moneda, monto: f.monto }))
    );
  }
  return salida;
}

// Lo que falta por cobrar: pendiente + vencido (lo cobrado ya no se persigue).
export function porCobrar(facturas: FacturaMonto[]): MontoAgrupado[] {
  return totalPorMoneda(
    facturas
      .filter((f) => f.estadoPago !== "pagado")
      .map((f) => ({ moneda: f.moneda, monto: f.monto }))
  );
}

export { formatTotales, formatMonto };
