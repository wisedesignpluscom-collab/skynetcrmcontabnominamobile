// Cédula de identidad — Venezuela.
//
// Formato: una letra de tipo y de 5 a 8 dígitos: V-12345678.
//   V = venezolano · E = extranjero
// A diferencia del RIF (lib/rif.ts) no lleva dígito verificador.
//
// Módulo puro (sin Prisma ni Next) — se usa en validaciones de servidor y cliente.

export const TIPOS_CEDULA = ["V", "E"] as const;

// Acepta con o sin guion y en minúsculas: "v12345678" o "V-12345678"
const CEDULA_RE = /^([VE])-?(\d{5,8})$/i;

export type CedulaPartes = {
  tipo: string; // V | E
  numero: string; // 5 a 8 dígitos
};

// Descompone la cédula, o null si no cumple el formato.
export function parseCedula(raw: string | null | undefined): CedulaPartes | null {
  if (!raw) return null;
  const m = CEDULA_RE.exec(raw.trim().replace(/\s+/g, ""));
  if (!m) return null;
  return { tipo: m[1].toUpperCase(), numero: m[2] };
}

export function isCedulaValida(raw: string | null | undefined): boolean {
  return parseCedula(raw) !== null;
}

// Deja la cédula en su forma canónica V-12345678 (para guardarla y compararla).
// Si no es válida devuelve el texto original recortado, sin inventar nada.
export function normalizeCedula(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const limpio = raw.trim();
  if (!limpio) return null;
  const p = parseCedula(limpio);
  return p ? `${p.tipo}-${p.numero}` : limpio;
}

export const MENSAJE_CEDULA_INVALIDA =
  "La cédula debe tener el formato V-12345678 o E-12345678 (letra V o E y de 5 a 8 dígitos).";
