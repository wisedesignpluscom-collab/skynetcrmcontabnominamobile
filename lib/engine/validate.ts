// ══ Automation Engine — Validación server-side (Fase 2) ════════════════════
// Punto de entrada que usan las server actions ANTES de persistir.
// Carga las reglas del módulo y delega en el módulo puro (formRules.ts).

import { loadRules } from "./load";
import {
  computeValidationErrors,
  FORM_CHANGE_TRIGGER,
  FORM_VALIDATE_TRIGGER,
} from "./formRules";
import type { RuleContext } from "./evaluator";

export type ValidationOutcome = { ok: boolean; errors: string[] };

export async function validateForm(
  module: string,
  ctx: RuleContext
): Promise<ValidationOutcome> {
  const [validationRules, formRules] = await Promise.all([
    loadRules({ module, trigger: FORM_VALIDATE_TRIGGER }),
    loadRules({ module, trigger: FORM_CHANGE_TRIGGER }),
  ]);

  const errors = computeValidationErrors(validationRules, formRules, ctx);
  return { ok: errors.length === 0, errors };
}

// Convierte un FormData en el registro plano que evalúa el motor
export function formDataToRecord(formData: FormData): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    if (key.startsWith("$ACTION")) return; // internos de Next
    if (typeof value === "string") record[key] = value;
  });
  return record;
}
