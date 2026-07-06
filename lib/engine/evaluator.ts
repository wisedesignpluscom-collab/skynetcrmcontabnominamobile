// ══ Automation Engine — Evaluador de reglas (Fase 1) ═══════════════════════
// Módulo PURO: sin Prisma, sin Next, sin efectos. Recibe un contexto
// (registro + usuario + pipeline) y decide qué acciones disparar.
// Esto lo hace testeable de forma aislada (ver tests/evaluator.test.ts).

// ── Tipos ───────────────────────────────────────────────────────────────────

export type OperatorCode =
  | "eq"            // =
  | "neq"           // ≠
  | "gt"            // >
  | "lt"            // <
  | "gte"           // >=
  | "lte"           // <=
  | "contains"      // contiene
  | "not_contains"  // no contiene
  | "starts_with"   // empieza con
  | "ends_with"     // termina con
  | "is_empty"      // está vacío
  | "not_empty"     // no está vacío
  | "between"       // entre (value y value2)
  | "relative_date" // fecha relativa (± N días desde hoy)
  | "is_current_user" // el campo es el usuario actual
  | "has_role"      // rol actual del usuario
  | "in_pipeline"   // pipeline actual
  | "in_stage";     // etapa actual

// Metadatos para el Builder (Fase 3): etiqueta en español y valores que requiere
export const OPERATORS: Record<
  OperatorCode,
  { label: string; needsValue: boolean; needsValue2: boolean }
> = {
  eq: { label: "es igual a", needsValue: true, needsValue2: false },
  neq: { label: "es distinto de", needsValue: true, needsValue2: false },
  gt: { label: "es mayor que", needsValue: true, needsValue2: false },
  lt: { label: "es menor que", needsValue: true, needsValue2: false },
  gte: { label: "es mayor o igual que", needsValue: true, needsValue2: false },
  lte: { label: "es menor o igual que", needsValue: true, needsValue2: false },
  contains: { label: "contiene", needsValue: true, needsValue2: false },
  not_contains: { label: "no contiene", needsValue: true, needsValue2: false },
  starts_with: { label: "empieza con", needsValue: true, needsValue2: false },
  ends_with: { label: "termina con", needsValue: true, needsValue2: false },
  is_empty: { label: "está vacío", needsValue: false, needsValue2: false },
  not_empty: { label: "no está vacío", needsValue: false, needsValue2: false },
  between: { label: "está entre", needsValue: true, needsValue2: true },
  relative_date: { label: "fecha relativa (± días)", needsValue: true, needsValue2: false },
  is_current_user: { label: "es el usuario actual", needsValue: false, needsValue2: false },
  has_role: { label: "el rol actual es", needsValue: true, needsValue2: false },
  in_pipeline: { label: "el pipeline actual es", needsValue: true, needsValue2: false },
  in_stage: { label: "la etapa actual es", needsValue: true, needsValue2: false },
};

export type ConditionDef = {
  field: string;
  op: OperatorCode;
  value?: string | null;
  value2?: string | null;
};

export type GroupDef = {
  operator: "AND" | "OR";
  conditions: ConditionDef[];
  groups: GroupDef[];
};

export type ActionDef = {
  type: string;
  params: Record<string, unknown>;
  order: number;
};

export type RuleDef = {
  id: string;
  name: string;
  module: string;
  trigger?: string | null;
  enabled: boolean;
  priority: number;
  root: GroupDef | null;
  actions: ActionDef[];
};

export type RuleContext = {
  // El registro evaluado (contacto, oportunidad, empresa…) como objeto plano
  record: Record<string, unknown>;
  // Usuario de la sesión (mismo shape que SessionUser de lib/session.ts)
  user?: { id: string; role: string } | null;
  // Ubicación en el pipeline, si aplica
  pipeline?: { pipelineId?: string | null; stageId?: string | null; stageName?: string | null } | null;
  // Inyectable en tests para operadores de fecha
  now?: Date;
};

export type EvaluationResult = {
  ruleId: string;
  matched: boolean;
  actions: ActionDef[];
};

// ── Utilidades de comparación ───────────────────────────────────────────────

// Normaliza texto: sin acentos, minúsculas, sin espacios extremos
function norm(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Resuelve una ruta con puntos dentro del registro: "contact.email" → record.contact.email
export function getField(record: Record<string, unknown>, path: string): unknown {
  let current: unknown = record;
  for (const part of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// Compara con coerción: numérica si ambos lados son números, si no por fecha,
// si no como texto normalizado. Devuelve null si no son comparables.
function compare(a: unknown, b: unknown): number | null {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na === nb ? 0 : na > nb ? 1 : -1;

  const da = asDate(a);
  const db = asDate(b);
  // Solo comparar como fechas si al menos uno NO era numérico puro
  if (da && db && (na === null || nb === null)) {
    const ta = da.getTime();
    const tb = db.getTime();
    return ta === tb ? 0 : ta > tb ? 1 : -1;
  }

  if (isBlank(a) || isBlank(b)) return null;
  const sa = norm(a);
  const sb = norm(b);
  return sa === sb ? 0 : sa > sb ? 1 : -1;
}

// ── Evaluación de una condición ─────────────────────────────────────────────

export function evaluateCondition(cond: ConditionDef, ctx: RuleContext): boolean {
  const now = ctx.now ?? new Date();
  const raw = getField(ctx.record, cond.field);

  switch (cond.op) {
    case "eq": {
      const c = compare(raw, cond.value);
      return c === 0;
    }
    case "neq": {
      const c = compare(raw, cond.value);
      return c !== 0; // incluye no-comparables: "distinto" es verdadero
    }
    case "gt": {
      const c = compare(raw, cond.value);
      return c === 1;
    }
    case "lt": {
      const c = compare(raw, cond.value);
      return c === -1;
    }
    case "gte": {
      const c = compare(raw, cond.value);
      return c === 0 || c === 1;
    }
    case "lte": {
      const c = compare(raw, cond.value);
      return c === 0 || c === -1;
    }
    case "contains":
      return !isBlank(raw) && norm(raw).includes(norm(cond.value));
    case "not_contains":
      return isBlank(raw) || !norm(raw).includes(norm(cond.value));
    case "starts_with":
      return !isBlank(raw) && norm(raw).startsWith(norm(cond.value));
    case "ends_with":
      return !isBlank(raw) && norm(raw).endsWith(norm(cond.value));
    case "is_empty":
      return isBlank(raw);
    case "not_empty":
      return !isBlank(raw);
    case "between": {
      const lowCmp = compare(raw, cond.value);
      const highCmp = compare(raw, cond.value2);
      if (lowCmp === null || highCmp === null) return false;
      return (lowCmp === 0 || lowCmp === 1) && (highCmp === 0 || highCmp === -1);
    }
    case "relative_date": {
      // value = N días con signo. Negativo: el campo cae en los últimos N días.
      // Positivo: cae en los próximos N días. Cero: es hoy (mismo día calendario).
      const fieldDate = asDate(raw);
      const days = asNumber(cond.value);
      if (!fieldDate || days === null) return false;
      if (days === 0) {
        return (
          fieldDate.getFullYear() === now.getFullYear() &&
          fieldDate.getMonth() === now.getMonth() &&
          fieldDate.getDate() === now.getDate()
        );
      }
      const limit = new Date(now.getTime() + days * 86_400_000);
      return days < 0
        ? fieldDate.getTime() >= limit.getTime() && fieldDate.getTime() <= now.getTime()
        : fieldDate.getTime() >= now.getTime() && fieldDate.getTime() <= limit.getTime();
    }
    case "is_current_user":
      return !isBlank(raw) && !!ctx.user && String(raw) === ctx.user.id;
    case "has_role":
      return !!ctx.user && norm(ctx.user.role) === norm(cond.value);
    case "in_pipeline":
      return !!ctx.pipeline && norm(ctx.pipeline.pipelineId) === norm(cond.value);
    case "in_stage": {
      if (!ctx.pipeline) return false;
      const target = norm(cond.value);
      return (
        (!isBlank(ctx.pipeline.stageId) && norm(ctx.pipeline.stageId) === target) ||
        (!isBlank(ctx.pipeline.stageName) && norm(ctx.pipeline.stageName) === target)
      );
    }
    default:
      return false;
  }
}

// ── Evaluación del árbol AND/OR ─────────────────────────────────────────────

export function evaluateGroup(group: GroupDef, ctx: RuleContext): boolean {
  const results: boolean[] = [
    ...group.conditions.map((c) => evaluateCondition(c, ctx)),
    ...group.groups.map((g) => evaluateGroup(g, ctx)),
  ];
  // Grupo vacío: verdadero (una regla sin condiciones siempre aplica)
  if (results.length === 0) return true;
  return group.operator === "OR" ? results.some(Boolean) : results.every(Boolean);
}

// ── Evaluación de reglas ────────────────────────────────────────────────────

export function evaluateRule(rule: RuleDef, ctx: RuleContext): EvaluationResult {
  if (!rule.enabled) return { ruleId: rule.id, matched: false, actions: [] };
  const matched = rule.root ? evaluateGroup(rule.root, ctx) : true;
  return {
    ruleId: rule.id,
    matched,
    actions: matched ? [...rule.actions].sort((a, b) => a.order - b.order) : [],
  };
}

// Evalúa varias reglas (respetando prioridad) y devuelve solo las que aplican
export function evaluateRules(rules: RuleDef[], ctx: RuleContext): EvaluationResult[] {
  return [...rules]
    .sort((a, b) => a.priority - b.priority)
    .map((r) => evaluateRule(r, ctx))
    .filter((r) => r.matched);
}
