// ══ Automation Engine — Catálogos del Builder (Fase 4) ══════════════════════
// Módulo PURO (sin Prisma, sin Next): metadatos en español que consume la UI
// del constructor visual (/automatizaciones) y la validación server-side de
// borradores. EVENT_TYPES y WORKFLOW_ACTIONS viven aquí y se re-exportan desde
// events.ts / actions.ts para no romper a sus consumidores.

import { OPERATORS, type OperatorCode, type GroupDef } from "./evaluator";
import { FORM_CHANGE_TRIGGER, FORM_VALIDATE_TRIGGER } from "./formRules";

// ── Eventos que disparan workflows (movido desde events.ts) ─────────────────
export const EVENT_TYPES: Record<string, { label: string; entity: string }> = {
  "contact.created": { label: "Al crear un contacto", entity: "contact" },
  "contact.deleted": { label: "Al eliminar un contacto", entity: "contact" },
  "company.created": { label: "Al crear una empresa", entity: "company" },
  "company.deleted": { label: "Al eliminar una empresa", entity: "company" },
  "deal.created": { label: "Al crear una oportunidad", entity: "deal" },
  "deal.updated": { label: "Al actualizar una oportunidad", entity: "deal" },
  "deal.stage_changed": { label: "Al cambiar de etapa una oportunidad", entity: "deal" },
  "deal.won": { label: "Al ganar una oportunidad", entity: "deal" },
  "deal.lost": { label: "Al perder una oportunidad", entity: "deal" },
  "deal.deleted": { label: "Al eliminar una oportunidad", entity: "deal" },
  "task.created": { label: "Al crear una tarea", entity: "task" },
  "task.completed": { label: "Al completar una tarea", entity: "task" },
  "followup.saved": { label: "Al registrar un contacto de posventa", entity: "followup" },
  // Evaluado periódicamente sobre los registros del módulo (ver queue.ts, runEngineTick)
  "tiempo.transcurrido": { label: "Cuando pasa el tiempo (revisión diaria)", entity: "*" },
};

// ── Triggers de Pipeline Rules (Fase 5) ─────────────────────────────────────
// Reglas ligadas a UNA etapa concreta (Rule.stageId). «requisito» corre
// síncrono dentro de applyStageMove y bloquea el movimiento; entrada/salida
// encolan acciones de workflow como cualquier evento (ver lib/deals.ts).
export const PIPELINE_TRIGGERS: Record<string, { label: string; hint: string }> = {
  "pipeline.requisito": {
    label: "Requisito para entrar a la etapa",
    hint: "Si la condición se cumple al intentar mover la oportunidad, el movimiento se bloquea con un mensaje.",
  },
  "pipeline.entrada": {
    label: "Al entrar a la etapa",
    hint: "Cuando una oportunidad llega a esta etapa, se ejecutan las acciones.",
  },
  "pipeline.salida": {
    label: "Al salir de la etapa",
    hint: "Cuando una oportunidad deja esta etapa, se ejecutan las acciones.",
  },
};

export const PIPELINE_REQUIREMENT_TRIGGER = "pipeline.requisito";
export const PIPELINE_ENTER_TRIGGER = "pipeline.entrada";
export const PIPELINE_EXIT_TRIGGER = "pipeline.salida";

// ── Módulos del CRM sobre los que operan las reglas ─────────────────────────
export const MODULES: Record<string, { label: string }> = {
  contact: { label: "Contactos" },
  company: { label: "Empresas" },
  deal: { label: "Oportunidades" },
  task: { label: "Tareas" },
  followup: { label: "Posventa" },
};

// ── Parámetros que pide cada acción en el Builder ────────────────────────────
// kind controla el input; options estáticas o dynamic (el servidor inyecta la
// lista real: etapas, usuarios, catálogos…). template=true admite {campo}.
export type ParamSpec = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "select";
  options?: string[];
  dynamic?: DynamicOptionKey;
  template?: boolean;
  hint?: string;
  required?: boolean;
};

export type DynamicOptionKey =
  | "stage" // etapas del pipeline (por nombre)
  | "source" // catálogo origen del lead
  | "task_type" // catálogo tipos de tarea
  | "industry" // catálogo sectores
  | "user" // usuarios activos
  | "email_template" // plantillas de correo
  | "email_account"; // cuentas de correo saliente

export type ActionSpec = { label: string; params: ParamSpec[]; hint?: string };

// ── Acciones de workflow (etiquetas movidas desde actions.ts) ────────────────
export const WORKFLOW_ACTIONS: Record<string, ActionSpec> = {
  crear_tarea: {
    label: "Crear una tarea",
    params: [
      { key: "titulo", label: "Título", kind: "text", template: true, required: true },
      { key: "tipo", label: "Tipo", kind: "select", dynamic: "task_type" },
      { key: "dias", label: "Vence en (días)", kind: "number", hint: "0 = hoy" },
    ],
  },
  enviar_notificacion: {
    label: "Enviar una notificación (campanita)",
    params: [
      { key: "titulo", label: "Título", kind: "text", template: true, required: true },
      { key: "mensaje", label: "Mensaje", kind: "textarea", template: true },
      { key: "url", label: "Enlace al hacer clic", kind: "text", hint: "ej. /tareas" },
    ],
  },
  enviar_email: {
    label: "Enviar un email",
    hint: "Elige una plantilla, o escribe el asunto y el cuerpo a mano.",
    params: [
      { key: "cuenta", label: "Enviar desde", kind: "select", dynamic: "email_account", hint: "Cuenta remitente; vacío = la predeterminada." },
      { key: "para", label: "Para", kind: "text", template: true, required: true, hint: "ej. {contact.email}" },
      { key: "plantilla", label: "Plantilla", kind: "select", dynamic: "email_template", hint: "Si eliges una, se usa su asunto y cuerpo (con las variables resueltas)." },
      { key: "asunto", label: "Asunto (si no usas plantilla)", kind: "text", template: true },
      { key: "cuerpo", label: "Cuerpo (si no usas plantilla)", kind: "textarea", template: true },
    ],
  },
  actualizar_campos: {
    label: "Actualizar campos del registro",
    hint: "Solo campos permitidos por entidad; montos, etapas y vendedor quedan fuera a propósito.",
    params: [
      { key: "campo", label: "Campo", kind: "text", required: true, hint: "ej. notes, probability" },
      { key: "valor", label: "Nuevo valor", kind: "text", template: true, hint: "fechas: 2026-08-01 o +30d" },
    ],
  },
  crear_registro: {
    label: "Crear un registro",
    params: [
      { key: "entidad", label: "Qué crear", kind: "select", options: ["activity", "contact", "deal"], required: true },
      { key: "datos", label: "Datos (JSON)", kind: "textarea", template: true, hint: 'ej. {"content": "Bienvenida a {firstName}"}' },
    ],
  },
  esperar: {
    label: "Esperar (retrasa las acciones siguientes)",
    params: [
      { key: "dias", label: "Días", kind: "number" },
      { key: "horas", label: "Horas", kind: "number" },
      { key: "minutos", label: "Minutos", kind: "number" },
    ],
  },
  llamar_webhook: {
    label: "Llamar un webhook (URL externa)",
    params: [
      { key: "url", label: "URL", kind: "text", required: true },
      { key: "metodo", label: "Método", kind: "select", options: ["POST", "GET"] },
    ],
  },
};

// ── Acciones de Form Rules (tipos de lib/engine/formRules.ts) ────────────────
const targetParam: ParamSpec = { key: "target", label: "Campo del formulario", kind: "select", dynamic: undefined, required: true };

export const FORM_ACTIONS: Record<string, ActionSpec> = {
  mostrar: { label: "Mostrar un campo", params: [targetParam] },
  ocultar: { label: "Ocultar un campo", params: [targetParam] },
  requerir: { label: "Hacer un campo obligatorio", params: [targetParam] },
  quitar_requerido: { label: "Quitar obligatoriedad", params: [targetParam] },
  bloquear: { label: "Bloquear un campo", params: [targetParam] },
  desbloquear: { label: "Desbloquear un campo", params: [targetParam] },
  cambiar_valor: {
    label: "Cambiar el valor de un campo",
    params: [targetParam, { key: "value", label: "Valor", kind: "text" }],
  },
  limpiar_valor: { label: "Limpiar el valor de un campo", params: [targetParam] },
  calcular_valor: {
    label: "Calcular el valor (fórmula)",
    params: [targetParam, { key: "formula", label: "Fórmula", kind: "text", hint: "ej. {amount} * 0.9" }],
  },
  mostrar_mensaje: {
    label: "Mostrar un mensaje",
    params: [
      { key: "message", label: "Mensaje", kind: "textarea", required: true },
      { key: "tone", label: "Tono", kind: "select", options: ["info", "warning", "error"] },
    ],
  },
  resaltar_campo: { label: "Resaltar un campo", params: [targetParam] },
  cambiar_placeholder: {
    label: "Cambiar el texto de ejemplo",
    params: [targetParam, { key: "value", label: "Texto", kind: "text" }],
  },
  cambiar_tooltip: {
    label: "Cambiar la ayuda (tooltip)",
    params: [targetParam, { key: "value", label: "Texto", kind: "text" }],
  },
};

export const VALIDATION_ACTIONS: Record<string, ActionSpec> = {
  validation_error: {
    label: "Bloquear el guardado con un mensaje",
    params: [{ key: "message", label: "Mensaje de error", kind: "textarea", required: true }],
  },
};

// Única acción de los requisitos de etapa: no se encola, la consume
// applyStageMove de forma síncrona para frenar el arrastre en el kanban.
export const PIPELINE_BLOCK_ACTIONS: Record<string, ActionSpec> = {
  bloquear_movimiento: {
    label: "Bloquear el movimiento con un mensaje",
    params: [
      {
        key: "message",
        label: "Mensaje para el vendedor",
        kind: "textarea",
        template: true,
        required: true,
        hint: "ej. «{title}» necesita un valor antes de pasar a esta etapa",
      },
    ],
  },
};

// ── Tipos de regla que edita el Builder ──────────────────────────────────────
export type RuleKind = "workflow" | "form" | "validation" | "pipeline";

export const RULE_KINDS: Record<
  RuleKind,
  { label: string; plural: string; desc: string; actions: Record<string, ActionSpec> }
> = {
  workflow: {
    label: "Workflow",
    plural: "Workflows",
    desc: "Cuando ocurre un evento, ejecuta acciones (tareas, avisos, emails…).",
    actions: WORKFLOW_ACTIONS,
  },
  form: {
    label: "Regla de formulario",
    plural: "Reglas de formulario",
    desc: "Mientras se llena un formulario, cambia campos (mostrar, requerir, calcular…).",
    actions: FORM_ACTIONS,
  },
  validation: {
    label: "Regla de validación",
    plural: "Reglas de validación",
    desc: "Al guardar, bloquea el registro si no cumple la condición.",
    actions: VALIDATION_ACTIONS,
  },
  pipeline: {
    label: "Regla de pipeline",
    plural: "Reglas de pipeline",
    // actions es el superconjunto (para resolver etiquetas); lo que se puede
    // agregar en cada caso lo decide actionsForTrigger según el disparador.
    desc: "Gobierna una etapa del pipeline: requisitos para entrar y acciones al entrar o salir.",
    actions: { ...PIPELINE_BLOCK_ACTIONS, ...WORKFLOW_ACTIONS },
  },
};

// Acciones disponibles para un borrador concreto: los requisitos de etapa solo
// bloquean; entrada/salida usan las acciones de workflow. El resto de tipos
// usa el set completo de su kind.
export function actionsForTrigger(kind: RuleKind, trigger: string): Record<string, ActionSpec> {
  if (kind !== "pipeline") return RULE_KINDS[kind]?.actions ?? {};
  return trigger === PIPELINE_REQUIREMENT_TRIGGER ? PIPELINE_BLOCK_ACTIONS : WORKFLOW_ACTIONS;
}

// Deduce el tipo de regla a partir del trigger guardado en la BD
export function kindOfTrigger(trigger: string | null | undefined): RuleKind | null {
  if (!trigger) return null;
  if (trigger === FORM_CHANGE_TRIGGER) return "form";
  if (trigger === FORM_VALIDATE_TRIGGER) return "validation";
  if (trigger in PIPELINE_TRIGGERS) return "pipeline";
  if (trigger in EVENT_TYPES) return "workflow";
  return null;
}

// ── Campos por módulo para el editor de condiciones ──────────────────────────
export type FieldSpec = {
  path: string; // ruta dentro del registro evaluado (getField)
  label: string;
  kind: "text" | "number" | "date" | "select";
  options?: string[];
  dynamic?: DynamicOptionKey;
  form?: boolean; // existe como campo del formulario (target de Form Rules)
};

export const FIELDS: Record<string, FieldSpec[]> = {
  contact: [
    { path: "firstName", label: "Nombre", kind: "text", form: true },
    { path: "lastName", label: "Apellido", kind: "text", form: true },
    { path: "email", label: "Email", kind: "text", form: true },
    { path: "phone", label: "Teléfono", kind: "text", form: true },
    { path: "position", label: "Cargo", kind: "text", form: true },
    { path: "source", label: "Origen", kind: "select", dynamic: "source", form: true },
    { path: "status", label: "Estado", kind: "select", options: ["lead", "cliente"], form: true },
    { path: "notes", label: "Notas", kind: "text", form: true },
    { path: "companyId", label: "Empresa (selección)", kind: "text", form: true },
    { path: "company.name", label: "Nombre de la empresa", kind: "text" },
    { path: "owner.name", label: "Vendedor asignado (nombre)", kind: "text" },
    { path: "ownerId", label: "Vendedor asignado", kind: "select", dynamic: "user" },
    { path: "createdAt", label: "Fecha de creación", kind: "date" },
  ],
  company: [
    { path: "name", label: "Nombre", kind: "text", form: true },
    { path: "industry", label: "Sector", kind: "select", dynamic: "industry", form: true },
    { path: "website", label: "Sitio web", kind: "text", form: true },
    { path: "phone", label: "Teléfono", kind: "text", form: true },
    { path: "address", label: "Dirección", kind: "text", form: true },
    { path: "city", label: "Ciudad", kind: "text", form: true },
    { path: "notes", label: "Notas", kind: "text", form: true },
    { path: "createdAt", label: "Fecha de creación", kind: "date" },
  ],
  deal: [
    { path: "title", label: "Título", kind: "text", form: true },
    { path: "amount", label: "Valor ($)", kind: "number", form: true },
    { path: "probability", label: "Probabilidad (%)", kind: "number", form: true },
    { path: "expectedCloseDate", label: "Cierre esperado", kind: "date", form: true },
    { path: "status", label: "Estado", kind: "select", options: ["open", "won", "lost"] },
    { path: "stage.name", label: "Etapa", kind: "select", dynamic: "stage" },
    { path: "contactId", label: "Contacto (selección)", kind: "text", form: true },
    { path: "contact.firstName", label: "Nombre del contacto", kind: "text" },
    { path: "contact.email", label: "Email del contacto", kind: "text" },
    { path: "company.name", label: "Nombre de la empresa", kind: "text" },
    { path: "owner.name", label: "Vendedor asignado (nombre)", kind: "text" },
    { path: "ownerId", label: "Vendedor asignado", kind: "select", dynamic: "user" },
    { path: "createdAt", label: "Fecha de creación", kind: "date" },
    { path: "closedAt", label: "Fecha de cierre", kind: "date" },
  ],
  task: [
    { path: "title", label: "Título", kind: "text", form: true },
    { path: "type", label: "Tipo", kind: "select", dynamic: "task_type", form: true },
    { path: "description", label: "Descripción", kind: "text", form: true },
    { path: "dueDate", label: "Vencimiento", kind: "date", form: true },
    { path: "done", label: "Completada", kind: "select", options: ["true", "false"] },
    { path: "contact.firstName", label: "Nombre del contacto", kind: "text" },
    { path: "deal.title", label: "Título de la oportunidad", kind: "text" },
    { path: "createdAt", label: "Fecha de creación", kind: "date" },
  ],
  followup: [
    { path: "stage", label: "Etapa de posventa", kind: "select", options: ["onboarding", "seguimiento", "fidelizado", "riesgo"], form: true },
    { path: "nextContactDate", label: "Próximo contacto", kind: "date", form: true },
    { path: "satisfaction", label: "Satisfacción (1-5)", kind: "number", form: true },
    { path: "notes", label: "Notas", kind: "text", form: true },
    { path: "contact.firstName", label: "Nombre del contacto", kind: "text" },
    { path: "contact.email", label: "Email del contacto", kind: "text" },
    { path: "deal.title", label: "Título de la oportunidad", kind: "text" },
    { path: "createdAt", label: "Fecha de creación", kind: "date" },
  ],
};

// ── Borrador que edita el Builder ────────────────────────────────────────────
// root tiene exactamente la forma de GroupDef (evaluator) y actions se guarda
// como RuleAction — el Builder NO inventa un formato paralelo.
export type DraftAction = { type: string; params: Record<string, string> };

export type RuleDraft = {
  name: string;
  description: string;
  kind: RuleKind;
  module: string;
  trigger: string;
  // Solo Pipeline Rules: ID de la etapa a la que aplica ("" = sin etapa)
  stageId: string;
  enabled: boolean;
  priority: number;
  root: GroupDef;
  actions: DraftAction[];
};

export function emptyGroup(operator: "AND" | "OR" = "AND"): GroupDef {
  return { operator, conditions: [], groups: [] };
}

export function emptyDraft(): RuleDraft {
  return {
    name: "",
    description: "",
    kind: "workflow",
    module: "contact",
    trigger: "contact.created",
    stageId: "",
    enabled: true,
    priority: 1,
    root: emptyGroup(),
    actions: [],
  };
}

// ── Validación del borrador (server-side, y reutilizable en cliente) ─────────
function validGroup(g: GroupDef, errors: string[], depth: number): void {
  if (depth > 5) {
    errors.push("Los grupos de condiciones no pueden anidarse más de 5 niveles.");
    return;
  }
  if (g.operator !== "AND" && g.operator !== "OR") {
    errors.push("Cada grupo debe combinar sus condiciones con Y o con O.");
  }
  for (const c of g.conditions) {
    const op = OPERATORS[c.op as OperatorCode];
    if (!op) {
      errors.push(`Operador desconocido: «${c.op}».`);
      continue;
    }
    // has_role/is_current_user no leen el campo; el resto sí lo necesita
    if (!c.field && c.op !== "has_role" && c.op !== "is_current_user") {
      errors.push("Hay una condición sin campo seleccionado.");
    }
    if (op.needsValue && (c.value === null || c.value === undefined || c.value === "")) {
      errors.push(`La condición «${c.field || c.op}» necesita un valor.`);
    }
    if (op.needsValue2 && (c.value2 === null || c.value2 === undefined || c.value2 === "")) {
      errors.push(`La condición «${c.field}» (está entre) necesita el segundo valor.`);
    }
  }
  for (const child of g.groups) validGroup(child, errors, depth + 1);
}

export function validateDraft(draft: RuleDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Ponle un nombre a la automatización.");
  if (!MODULES[draft.module]) errors.push("Selecciona un módulo válido.");

  const kind = RULE_KINDS[draft.kind];
  if (!kind) {
    errors.push("Tipo de automatización desconocido.");
    return errors;
  }

  if (draft.kind === "workflow") {
    const evt = EVENT_TYPES[draft.trigger];
    if (!evt) errors.push("Selecciona el evento que dispara el workflow.");
    else if (evt.entity !== "*" && evt.entity !== draft.module) {
      errors.push("El evento seleccionado no corresponde al módulo de la regla.");
    }
  } else if (draft.kind === "pipeline") {
    if (!PIPELINE_TRIGGERS[draft.trigger]) {
      errors.push("Selecciona qué gobierna la regla: requisito, entrada o salida de la etapa.");
    }
    if (draft.module !== "deal") {
      errors.push("Las reglas de pipeline operan sobre Oportunidades.");
    }
    if (!draft.stageId) {
      errors.push("Selecciona la etapa del pipeline a la que aplica la regla.");
    }
  } else {
    const expected = draft.kind === "form" ? FORM_CHANGE_TRIGGER : FORM_VALIDATE_TRIGGER;
    if (draft.trigger !== expected) errors.push("El disparador no corresponde al tipo de regla.");
  }

  if (draft.actions.length === 0) {
    errors.push("Agrega al menos una acción en la rama «Sí».");
  }
  const allowed = actionsForTrigger(draft.kind, draft.trigger);
  draft.actions.forEach((a, i) => {
    const spec = allowed[a.type];
    if (!spec) {
      errors.push(`La acción ${i + 1} («${a.type}») no existe para este tipo de regla.`);
      return;
    }
    for (const p of spec.params) {
      if (p.required && !(a.params[p.key] ?? "").trim()) {
        errors.push(`La acción «${spec.label}» necesita «${p.label}».`);
      }
    }
  });
  // «esperar» al final no retrasa nada — aviso como error de armado
  if (draft.actions.length > 0 && draft.actions[draft.actions.length - 1].type === "esperar") {
    errors.push("«Esperar» debe ir antes de otra acción (retrasa las que le siguen).");
  }

  validGroup(draft.root, errors, 1);
  if (!Number.isFinite(draft.priority)) errors.push("La prioridad debe ser un número.");
  return errors;
}
