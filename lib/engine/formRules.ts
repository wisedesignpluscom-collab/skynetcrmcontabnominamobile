// ══ Automation Engine — Form Rules y Validation Rules (Fase 2) ═════════════
// Módulo PURO (sin Prisma/Next): dado un conjunto de reglas y un contexto,
// calcula los efectos sobre los campos del formulario y los errores de
// validación. Corre idéntico en servidor (obligatorio) y en cliente (feedback).

import { evaluateRules, getField, type RuleDef, type RuleContext } from "./evaluator";

// ── Convención de triggers ──────────────────────────────────────────────────
// Rule.trigger = "form.change"   → Form Rules (efectos sobre campos)
// Rule.trigger = "form.validate" → Validation Rules (bloquean el guardado)
export const FORM_CHANGE_TRIGGER = "form.change";
export const FORM_VALIDATE_TRIGGER = "form.validate";

// ── Tipos de acción de Form Rules ───────────────────────────────────────────
// params.target = nombre del campo (o de la sección marcada con data-field)
export type FormActionType =
  | "mostrar"            // { target }
  | "ocultar"            // { target }
  | "requerir"           // { target }
  | "quitar_requerido"   // { target }
  | "bloquear"           // { target }
  | "desbloquear"        // { target }
  | "cambiar_valor"      // { target, value }
  | "limpiar_valor"      // { target }
  | "calcular_valor"     // { target, formula } — ej. "{amount} * 0.9"
  | "mostrar_mensaje"    // { message, tone?: "info" | "warning" | "error" }
  | "resaltar_campo"     // { target }
  | "cambiar_placeholder"// { target, value }
  | "cambiar_tooltip";   // { target, value }

export type FieldEffect = {
  visible?: boolean;
  required?: boolean;
  disabled?: boolean;
  value?: string;
  clearValue?: boolean;
  placeholder?: string;
  tooltip?: string;
  highlight?: boolean;
};

export type FormEffects = {
  fields: Record<string, FieldEffect>;
  messages: { text: string; tone: "info" | "warning" | "error" }[];
};

// ── Calculadora de fórmulas segura (sin eval) ───────────────────────────────
// Soporta: números, referencias {campo}, + - * / y paréntesis.
export function computeFormula(formula: string, record: Record<string, unknown>): number | null {
  // Sustituir referencias {campo} por su valor numérico
  const expr = formula.replace(/\{([^}]+)\}/g, (_, path: string) => {
    const v = getField(record, path.trim());
    const s = String(v ?? "").trim();
    // Campo ausente o vacío invalida la fórmula (Number("") sería 0)
    const n = typeof v === "number" ? v : s === "" ? NaN : Number(s);
    return Number.isFinite(n) ? String(n) : "NaN";
  });
  if (expr.includes("NaN")) return null;

  // Parser descendente recursivo — solo aritmética
  let pos = 0;
  const peek = () => expr[pos];
  const skip = () => {
    while (expr[pos] === " ") pos++;
  };

  function parseNumber(): number | null {
    skip();
    const start = pos;
    if (expr[pos] === "-") pos++;
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) pos++;
    if (pos === start || (expr.slice(start, pos) === "-" && pos === start + 1)) return null;
    const n = Number(expr.slice(start, pos));
    return Number.isFinite(n) ? n : null;
  }

  function parseFactor(): number | null {
    skip();
    if (peek() === "(") {
      pos++;
      const inner = parseSum();
      skip();
      if (peek() !== ")") return null;
      pos++;
      return inner;
    }
    return parseNumber();
  }

  function parseProduct(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    for (;;) {
      skip();
      const op = peek();
      if (op !== "*" && op !== "/") return left;
      pos++;
      const right = parseFactor();
      if (right === null) return null;
      if (op === "/" && right === 0) return null;
      left = op === "*" ? left * right : left / right;
    }
  }

  function parseSum(): number | null {
    let left = parseProduct();
    if (left === null) return null;
    for (;;) {
      skip();
      const op = peek();
      if (op !== "+" && op !== "-") return left;
      pos++;
      const right = parseProduct();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
  }

  const result = parseSum();
  skip();
  return pos === expr.length && result !== null ? result : null;
}

// ── Aplicador de Form Rules ─────────────────────────────────────────────────
// Evalúa las reglas y acumula los efectos. Si varias reglas tocan el mismo
// campo, la de mayor prioridad (evaluada después) sobreescribe los efectos
// escalares; los mensajes se acumulan.
export function applyFormRules(rules: RuleDef[], ctx: RuleContext): FormEffects {
  const effects: FormEffects = { fields: {}, messages: [] };
  const field = (name: string): FieldEffect => (effects.fields[name] ??= {});

  for (const result of evaluateRules(rules, ctx)) {
    for (const action of result.actions) {
      const p = action.params as Record<string, string | undefined>;
      const target = p.target ?? "";
      switch (action.type as FormActionType) {
        case "mostrar":
          field(target).visible = true;
          break;
        case "ocultar":
          field(target).visible = false;
          break;
        case "requerir":
          field(target).required = true;
          break;
        case "quitar_requerido":
          field(target).required = false;
          break;
        case "bloquear":
          field(target).disabled = true;
          break;
        case "desbloquear":
          field(target).disabled = false;
          break;
        case "cambiar_valor":
          field(target).value = p.value ?? "";
          break;
        case "limpiar_valor":
          field(target).clearValue = true;
          break;
        case "calcular_valor": {
          const computed = computeFormula(p.formula ?? "", ctx.record);
          if (computed !== null) field(target).value = String(computed);
          break;
        }
        case "mostrar_mensaje":
          effects.messages.push({
            text: p.message ?? "",
            tone: p.tone === "warning" || p.tone === "error" ? p.tone : "info",
          });
          break;
        case "resaltar_campo":
          field(target).highlight = true;
          break;
        case "cambiar_placeholder":
          field(target).placeholder = p.value ?? "";
          break;
        case "cambiar_tooltip":
          field(target).tooltip = p.value ?? "";
          break;
      }
    }
  }
  return effects;
}

// ── Validation Rules ────────────────────────────────────────────────────────
// Una regla de validación que APLICA produce un error (acción "validation_error").
// Además, los campos que las Form Rules marcaron como requeridos y visibles
// deben venir con valor — esa exigencia también se valida aquí (server-side).
export function computeValidationErrors(
  validationRules: RuleDef[],
  formRules: RuleDef[],
  ctx: RuleContext
): string[] {
  const errors: string[] = [];

  for (const result of evaluateRules(validationRules, ctx)) {
    for (const action of result.actions) {
      if (action.type === "validation_error") {
        const p = action.params as Record<string, string | undefined>;
        errors.push(p.message ?? "El registro no cumple una regla de validación.");
      }
    }
  }

  const effects = applyFormRules(formRules, ctx);
  for (const [name, eff] of Object.entries(effects.fields)) {
    if (eff.required && eff.visible !== false) {
      const v = getField(ctx.record, name);
      if (v === null || v === undefined || String(v).trim() === "") {
        errors.push(`El campo «${name}» es obligatorio.`);
      }
    }
  }

  return errors;
}
