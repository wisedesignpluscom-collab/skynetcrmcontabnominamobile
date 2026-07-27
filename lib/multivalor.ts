// Campos multi-valor en SQLite.
//
// SQLite no tiene columnas de arreglo, así que los campos de selección múltiple
// (municipios de operación, especialidades del profesional) se guardan como un
// texto con los valores separados por comas. Estos helpers son el único lugar
// que conoce ese formato: el resto del código trabaja con string[].
//
// Módulo puro (sin Prisma ni Next) — se puede importar desde cliente y servidor.

const SEP = ",";

// "Iribarren, Palavecino" → ["Iribarren", "Palavecino"]
export function parseMulti(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(SEP)
    .map((v) => v.trim())
    .filter(Boolean);
}

// ["Iribarren", "Palavecino"] → "Iribarren, Palavecino"
// Descarta vacíos y duplicados; null si no queda nada (columna opcional).
export function serializeMulti(values: string[] | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  const limpios = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  // Una coma dentro de un valor rompería el formato al leerlo de vuelta:
  // se cambia por espacio y se colapsan los espacios que queden.
  const seguros = limpios.map((v) => v.replace(/,/g, " ").replace(/\s+/g, " ").trim());
  return seguros.length > 0 ? seguros.join(`${SEP} `) : null;
}

// Lee todas las casillas/opciones marcadas con el mismo `name` en un formulario.
export function multiFromFormData(formData: FormData, field: string): string | null {
  return serializeMulti(formData.getAll(field).map((v) => String(v)));
}

// ¿El registro tiene este valor entre los suyos? (comparación tolerante)
export function hasValue(raw: string | null | undefined, value: string): boolean {
  const objetivo = value.trim().toLowerCase();
  return parseMulti(raw).some((v) => v.toLowerCase() === objetivo);
}

// Texto para mostrar en fichas y listados
export function formatMulti(raw: string | null | undefined, vacio = "—"): string {
  const valores = parseMulti(raw);
  return valores.length > 0 ? valores.join(", ") : vacio;
}
