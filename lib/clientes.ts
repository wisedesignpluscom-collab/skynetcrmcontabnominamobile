// Vocabulario del cliente contable: estados del ciclo de vida y monedas.
//
// Van como constantes (no como CatalogOption) porque el sistema razona sobre
// ellos: el estado decide si el cliente entra en la facturación recurrente y en
// los tableros. Los valores realmente configurables por instancia (municipios,
// régimen tributario, tamaño) sí son catálogos — ver lib/catalog.ts.
//
// Módulo puro: se importa desde componentes de cliente y de servidor.

// ── Estado del cliente ──────────────────────────────────────────────────────
export const ESTADOS_CLIENTE = [
  "lead",
  "prospecto",
  "activo",
  "inactivo",
  "perdido",
] as const;

export type EstadoCliente = (typeof ESTADOS_CLIENTE)[number];

export const estadoClienteLabels: Record<string, string> = {
  lead: "Lead",
  prospecto: "Prospecto",
  activo: "Cliente activo",
  inactivo: "Cliente inactivo",
  perdido: "Perdido",
};

// Clases del badge de estado (paleta slate + acento del tema)
export const estadoClienteClass: Record<string, string> = {
  lead: "bg-slate-100 text-slate-600",
  prospecto: "bg-blue-50 text-blue-700",
  activo: "bg-emerald-50 text-emerald-700",
  inactivo: "bg-amber-50 text-amber-700",
  perdido: "bg-red-50 text-red-600",
};

export function esEstadoCliente(v: string | null | undefined): v is EstadoCliente {
  return !!v && (ESTADOS_CLIENTE as readonly string[]).includes(v);
}

// Solo los clientes activos generan obligaciones recurrentes y facturación.
export function facturaRecurrente(estadoCliente: string | null | undefined): boolean {
  return estadoCliente === "activo";
}

// ── Moneda de facturación ───────────────────────────────────────────────────
export const MONEDAS = ["USD", "Bs"] as const;
export type Moneda = (typeof MONEDAS)[number];

export const monedaLabels: Record<string, string> = {
  USD: "Dólares (USD)",
  Bs: "Bolívares (Bs)",
};

// Formatea un monto en la moneda del cliente. Bs no es un código ISO que
// Intl reconozca en todos los runtimes, así que se compone a mano.
export function formatMonto(monto: number, moneda: string | null | undefined): string {
  if (moneda === "Bs") {
    return `Bs ${new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(monto)}`;
  }
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(monto);
}
