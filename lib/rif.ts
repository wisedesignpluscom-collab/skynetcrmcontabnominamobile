// Registro de Información Fiscal (RIF) — Venezuela.
//
// Formato: una letra de tipo, ocho dígitos y un dígito verificador: J-12345678-9.
//   J = jurídico (empresas) · V = venezolano · E = extranjero
//   G = gubernamental      · P = pasaporte
//
// El último dígito es el que usa el calendario del SENIAT para asignar fechas de
// vencimiento a los contribuyentes especiales (lo consume el motor de
// vencimientos en lib/fiscal/). Por eso `ultimoDigito` vive aquí y no allá.
//
// Módulo puro (sin Prisma ni Next) — se usa en validaciones de servidor y cliente.

export const TIPOS_RIF = ["J", "V", "E", "G", "P"] as const;

// Acepta con o sin guiones y en minúsculas: "j123456789" o "J-12345678-9"
const RIF_RE = /^([JVEGP])-?(\d{8})-?(\d)$/i;

export type RifPartes = {
  tipo: string; // J | V | E | G | P
  numero: string; // 8 dígitos
  verificador: string; // 1 dígito — el que usa el calendario del SENIAT
};

// Descompone el RIF, o null si no cumple el formato.
export function parseRif(raw: string | null | undefined): RifPartes | null {
  if (!raw) return null;
  const m = RIF_RE.exec(raw.trim().replace(/\s+/g, ""));
  if (!m) return null;
  return { tipo: m[1].toUpperCase(), numero: m[2], verificador: m[3] };
}

export function isRifValido(raw: string | null | undefined): boolean {
  return parseRif(raw) !== null;
}

// Deja el RIF en su forma canónica J-12345678-9 (para guardarlo y compararlo).
// Si no es válido devuelve el texto original recortado, sin inventar nada.
export function normalizeRif(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const limpio = raw.trim();
  if (!limpio) return null;
  const p = parseRif(limpio);
  return p ? `${p.tipo}-${p.numero}-${p.verificador}` : limpio;
}

// Último dígito del RIF (0-9) — entrada del calendario del SENIAT.
// null si el RIF no es válido: sin dígito no se puede calcular un vencimiento,
// y es preferible pedirlo a asumir uno.
export function ultimoDigito(raw: string | null | undefined): number | null {
  const p = parseRif(raw);
  return p ? Number(p.verificador) : null;
}

export const MENSAJE_RIF_INVALIDO =
  "El RIF debe tener el formato J-12345678-9 (letra J, V, E, G o P, ocho dígitos y el dígito verificador).";
