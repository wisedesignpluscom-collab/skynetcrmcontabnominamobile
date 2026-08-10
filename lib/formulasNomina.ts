// Motor de fórmulas de Conceptos y bonos (Etapa 2.5) — hace EJECUTABLE lo que
// en 2.4 era solo texto de ayuda. Reutiliza el evaluador aritmético seguro de
// Form Rules (lib/engine/formRules.ts, sin eval, ya probado) en vez de
// reescribirlo: solo traduce las variables sueldo/horas/dias del vocabulario
// de ConceptoNomina a la sintaxis {campo} que ese evaluador entiende.

import { computeFormula } from "./engine/formRules";

export const VARIABLES_FORMULA_CONCEPTO = ["sueldo", "horas", "dias"] as const;

export type VariablesFormulaConcepto = { sueldo: number; horas?: number; dias?: number };

// null = la fórmula no se pudo calcular (vacía, mal escrita, o falta una
// variable que referencia) — nunca se inventa un monto en su lugar; el
// llamador debe pedir el monto a mano.
export function evaluarFormulaConcepto(
  formula: string | null | undefined,
  vars: VariablesFormulaConcepto
): number | null {
  if (!formula?.trim()) return null;
  const conLlaves = formula.replace(/\b(sueldo|horas|dias)\b/g, "{$1}");
  const record: Record<string, unknown> = { sueldo: vars.sueldo, horas: vars.horas ?? 0, dias: vars.dias ?? 0 };
  return computeFormula(conLlaves, record);
}
