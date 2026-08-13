// Checklist de fases de una obligación — vocabulario del dominio (módulo puro,
// sin Prisma ni Next). Cada obligación (IVA, ISLR, FAOV…) define su propia
// secuencia de fases (FaseObligacion); cada CasoRecurrente avanza por ellas EN
// ORDEN, certificando cada paso con un mini-formulario (CasoFaseProgreso). Que
// exista el progreso de una fase ES que está completa: no hay bandera aparte.

export const TIPOS_CAMPO = ["texto", "numero", "fecha", "url"] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

export const tipoCampoLabels: Record<TipoCampo, string> = {
  texto: "Texto",
  numero: "Número",
  fecha: "Fecha",
  url: "Enlace / comprobante",
};

export type CampoFase = {
  id: string;
  label: string;
  tipo: TipoCampo;
  requerido: boolean;
};

export function esTipoCampo(v: string | null | undefined): v is TipoCampo {
  return !!v && (TIPOS_CAMPO as readonly string[]).includes(v);
}

// ── Parse/serialize defensivo (SQLite guarda JSON como texto) ───────────────

export function parseCampos(raw: string | null | undefined): CampoFase[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (c): c is CampoFase =>
          c &&
          typeof c.id === "string" &&
          typeof c.label === "string" &&
          esTipoCampo(c.tipo)
      )
      .map((c) => ({ id: c.id, label: c.label, tipo: c.tipo, requerido: !!c.requerido }));
  } catch {
    return [];
  }
}

export function serializeCampos(campos: CampoFase[]): string {
  return JSON.stringify(campos);
}

export function parseValores(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function serializeValores(valores: Record<string, string>): string {
  return JSON.stringify(valores);
}

// ── Validación del mini-formulario contra su spec ────────────────────────────

// Errores por campo, en español, para mostrarlos junto al input. Objeto vacío
// = formulario válido. Un campo no requerido y vacío no se valida por tipo
// (no hay nada que comprobar).
export function validarValoresFase(
  campos: CampoFase[],
  valores: Record<string, string>
): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const campo of campos) {
    const valor = (valores[campo.id] ?? "").trim();
    if (!valor) {
      if (campo.requerido) errores[campo.id] = "Este dato es obligatorio.";
      continue;
    }
    if (campo.tipo === "numero" && Number.isNaN(Number(valor))) {
      errores[campo.id] = "Debe ser un número.";
    }
    if (campo.tipo === "fecha" && Number.isNaN(Date.parse(valor))) {
      errores[campo.id] = "Fecha inválida.";
    }
  }
  return errores;
}

// ── Progreso de un caso frente a la plantilla de su obligación ──────────────

export type FaseConProgreso = {
  id: string;
  order: number;
  nombre: string;
  descripcion: string | null;
  campos: CampoFase[];
  completada: boolean;
  completedAt: Date | null;
  completedByNombre: string | null;
  valores: Record<string, string>;
};

// Ensambla la plantilla de una obligación con el progreso real de un caso.
// Puro para poder usarse tanto en la consulta de un solo caso (server action)
// como en la consulta en lote de la bandeja (evita el N+1 fila por fila).
export function ensamblarFases<
  F extends { id: string; order: number; nombre: string; descripcion: string | null; campos: string },
  P extends { faseObligacionId: string; completedAt: Date; valores: string; completedBy: { name: string } | null }
>(plantilla: F[], progresos: P[]): FaseConProgreso[] {
  const porFase = new Map(progresos.map((p) => [p.faseObligacionId, p]));
  return plantilla.map((f) => {
    const p = porFase.get(f.id);
    return {
      id: f.id,
      order: f.order,
      nombre: f.nombre,
      descripcion: f.descripcion,
      campos: parseCampos(f.campos),
      completada: !!p,
      completedAt: p?.completedAt ?? null,
      completedByNombre: p?.completedBy?.name ?? null,
      valores: parseValores(p?.valores),
    };
  });
}

// La fase de menor `order` sin progreso es la única que se puede completar
// ahora mismo; todas las de después quedan bloqueadas. Null si ya se
// completaron todas (o no hay plantilla).
export function faseActiva(fases: FaseConProgreso[]): FaseConProgreso | null {
  return fases.find((f) => !f.completada) ?? null;
}

export function todasCompletadas(fases: FaseConProgreso[]): boolean {
  return fases.length > 0 && fases.every((f) => f.completada);
}
