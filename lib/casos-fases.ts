// Sub-fases de un caso recurrente (Etapa 3 «Mis Consultores»): el checklist
// paso a paso de una obligación, con campos de evidencia estructurada — nunca
// un simple "¿lo hiciste? Sí/No". Módulo puro, sin Prisma ni Next, mismo
// espíritu que lib/casos.ts.

export const TIPOS_CAMPO_EVIDENCIA = ["texto", "numero", "fecha", "moneda", "archivo_url", "select"] as const;
export type TipoCampoEvidencia = (typeof TIPOS_CAMPO_EVIDENCIA)[number];

export const tipoCampoEvidenciaLabels: Record<TipoCampoEvidencia, string> = {
  texto: "Texto",
  numero: "Número",
  fecha: "Fecha",
  moneda: "Monto",
  archivo_url: "Comprobante (enlace)",
  select: "Selección",
};

export function esTipoCampoEvidencia(v: unknown): v is TipoCampoEvidencia {
  return typeof v === "string" && (TIPOS_CAMPO_EVIDENCIA as readonly string[]).includes(v);
}

// El campo de resultado que hay que llenar para completar una fase. `campo.
// claveUnicidad` marca los campos que, junto con los demás marcados, no
// pueden repetirse entre las fases ya completadas de la misma empresa (ver
// la validación "sin_duplicado" en lib/fiscal/faseValidaciones.ts).
export type EvidenciaCampoSpec = {
  clave: string;
  etiqueta: string;
  tipo: TipoCampoEvidencia;
  opciones?: string[];
  requerido: boolean;
  ayuda?: string;
  claveUnicidad?: boolean;
};

export function parseCamposEvidencia(json: string | null | undefined): EvidenciaCampoSpec[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (c): c is EvidenciaCampoSpec =>
        !!c && typeof c.clave === "string" && typeof c.etiqueta === "string" && esTipoCampoEvidencia(c.tipo)
    );
  } catch {
    return [];
  }
}

function valorVacio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

// Errores en español por campo requerido vacío o con formato inválido. No
// mira otros registros (eso es lib/fiscal/faseValidaciones.ts, server-only).
export function validarEvidenciaFase(campos: EvidenciaCampoSpec[], datos: Record<string, unknown>): string[] {
  const errores: string[] = [];
  for (const campo of campos) {
    const valor = datos[campo.clave];
    if (campo.requerido && valorVacio(valor)) {
      errores.push(`${campo.etiqueta}: es obligatorio para completar esta fase`);
      continue;
    }
    if (valorVacio(valor)) continue;
    if ((campo.tipo === "numero" || campo.tipo === "moneda") && Number.isNaN(Number(valor))) {
      errores.push(`${campo.etiqueta}: debe ser un número`);
    }
    if (campo.tipo === "fecha" && Number.isNaN(Date.parse(String(valor)))) {
      errores.push(`${campo.etiqueta}: debe ser una fecha válida`);
    }
    if (campo.tipo === "select" && campo.opciones && !campo.opciones.includes(String(valor))) {
      errores.push(`${campo.etiqueta}: valor fuera del catálogo`);
    }
  }
  return errores;
}

export type CasoFaseResumen = {
  estado: string;
  obligacionFase: { nombre: string; active: boolean; order: number };
};

// El caso solo puede avanzar (en_revision/presentado) cuando TODAS las
// sub-fases activas de su plantilla están completadas — la garantía del
// sistema, no una regla configurable del Builder (ver CLAUDE.md §18).
export function puedeAvanzarCaso(fases: CasoFaseResumen[]): { ok: boolean; faltantes: string[] } {
  const faltantes = fases
    .filter((f) => f.obligacionFase.active && f.estado !== "completada")
    .sort((a, b) => a.obligacionFase.order - b.obligacionFase.order)
    .map((f) => f.obligacionFase.nombre);
  return { ok: faltantes.length === 0, faltantes };
}
