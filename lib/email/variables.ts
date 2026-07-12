// Variables disponibles para las plantillas de correo, por módulo. Reutiliza el
// catálogo de campos del motor de automatizaciones (FIELDS) para no duplicar la
// lista. El token {ruta} lo resuelve renderTemplate contra el registro real.

import { FIELDS, MODULES } from "@/lib/engine/builder";

export type TemplateVariable = { token: string; label: string };

// Módulos que tienen sentido como origen de un correo (tienen destinatario)
export const TEMPLATE_MODULES = MODULES;

export function templateVariables(module: string): TemplateVariable[] {
  return (FIELDS[module] ?? []).map((f) => ({ token: `{${f.path}}`, label: f.label }));
}

// Valores de ejemplo para la vista previa (por etiqueta, aproximado)
export function sampleValueFor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("email") || l.includes("correo")) return "cliente@empresa.com";
  if (l.includes("nombre") && l.includes("empresa")) return "Distribuidora El Sol, C.A.";
  if (l.includes("empresa")) return "Distribuidora El Sol, C.A.";
  if (l.includes("nombre")) return "María";
  if (l.includes("apellido")) return "González";
  if (l.includes("teléfono") || l.includes("telefono")) return "0414-555-1234";
  if (l.includes("valor") || l.includes("monto")) return "1.500";
  if (l.includes("título") || l.includes("titulo")) return "Contabilidad mensual";
  if (l.includes("cargo")) return "Gerente";
  if (l.includes("fecha")) return "15/08/2026";
  if (l.includes("etapa")) return "Negociación";
  return "—";
}
