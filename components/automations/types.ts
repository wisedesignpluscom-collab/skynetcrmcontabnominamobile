// Opciones dinámicas que el servidor inyecta al Builder (etapas, catálogos,
// usuarios). La clave coincide con DynamicOptionKey de lib/engine/builder.ts.
export type DynamicOptions = Record<string, { value: string; label: string }[]>;
