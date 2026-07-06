// Tests unitarios de Form Rules y Validation Rules (módulo puro).
// Ejecutar con:  npx tsx tests/form-rules.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFormRules,
  computeFormula,
  computeValidationErrors,
} from "../lib/engine/formRules";
import type { RuleDef, RuleContext } from "../lib/engine/evaluator";

const ctxReferido: RuleContext = {
  record: { firstName: "Ana", source: "Referido", email: "", notes: "", amount: "2000" },
  user: { id: "u1", role: "vendedor" },
};

function regla(partial: Partial<RuleDef> & Pick<RuleDef, "id" | "actions">): RuleDef {
  return {
    name: partial.id,
    module: "contact",
    trigger: "form.change",
    enabled: true,
    priority: 0,
    root: null,
    ...partial,
  } as RuleDef;
}

// ── computeFormula ──────────────────────────────────────────────────────────

test("computeFormula: aritmética con referencias a campos y paréntesis", () => {
  const rec = { amount: 2000, factor: "0.5" };
  assert.equal(computeFormula("{amount} * 0.9", rec), 1800);
  assert.equal(computeFormula("({amount} + 1000) * {factor}", rec), 1500);
  assert.equal(computeFormula("{amount} / 4 - 100", rec), 400);
});

test("computeFormula: entradas inválidas devuelven null (nunca lanza)", () => {
  const rec = { amount: 2000, texto: "hola" };
  assert.equal(computeFormula("{inexistente} * 2", rec), null);
  assert.equal(computeFormula("{texto} + 1", rec), null);
  assert.equal(computeFormula("{amount} / 0", rec), null);
  assert.equal(computeFormula("{amount} +* 2", rec), null);
  assert.equal(computeFormula("alert(1)", rec), null);
});

// ── applyFormRules: los 12 efectos ──────────────────────────────────────────

test("efectos de campo: requerir, resaltar, tooltip cuando origen = Referido", () => {
  const r = regla({
    id: "fr1",
    root: {
      operator: "AND",
      conditions: [{ field: "source", op: "eq", value: "Referido" }],
      groups: [],
    },
    actions: [
      { type: "requerir", params: { target: "notes" }, order: 1 },
      { type: "resaltar_campo", params: { target: "notes" }, order: 2 },
      { type: "cambiar_tooltip", params: { target: "notes", value: "Indica quién lo refirió" }, order: 3 },
      { type: "mostrar_mensaje", params: { message: "Los referidos convierten 3x: registra quién lo refirió.", tone: "info" }, order: 4 },
    ],
  });

  const fx = applyFormRules([r], ctxReferido);
  assert.equal(fx.fields.notes.required, true);
  assert.equal(fx.fields.notes.highlight, true);
  assert.equal(fx.fields.notes.tooltip, "Indica quién lo refirió");
  assert.equal(fx.messages.length, 1);
  assert.equal(fx.messages[0].tone, "info");

  // Con otro origen la regla no aplica: cero efectos
  const fx2 = applyFormRules([r], { ...ctxReferido, record: { ...ctxReferido.record, source: "Evento" } });
  assert.deepEqual(fx2.fields, {});
  assert.deepEqual(fx2.messages, []);
});

test("mostrar/ocultar, bloquear/desbloquear, cambiar/limpiar valor y placeholder", () => {
  const r = regla({
    id: "fr2",
    actions: [
      { type: "ocultar", params: { target: "seccionAvanzada" }, order: 1 },
      { type: "mostrar", params: { target: "email" }, order: 2 },
      { type: "bloquear", params: { target: "status" }, order: 3 },
      { type: "desbloquear", params: { target: "phone" }, order: 4 },
      { type: "cambiar_valor", params: { target: "source", value: "Sitio web" }, order: 5 },
      { type: "limpiar_valor", params: { target: "notes" }, order: 6 },
      { type: "cambiar_placeholder", params: { target: "email", value: "correo@empresa.com" }, order: 7 },
    ],
  });
  const fx = applyFormRules([r], ctxReferido);
  assert.equal(fx.fields.seccionAvanzada.visible, false);
  assert.equal(fx.fields.email.visible, true);
  assert.equal(fx.fields.status.disabled, true);
  assert.equal(fx.fields.phone.disabled, false);
  assert.equal(fx.fields.source.value, "Sitio web");
  assert.equal(fx.fields.notes.clearValue, true);
  assert.equal(fx.fields.email.placeholder, "correo@empresa.com");
});

test("calcular_valor usa la fórmula sobre el registro actual", () => {
  const r = regla({
    id: "fr3",
    actions: [{ type: "calcular_valor", params: { target: "montoConIva", formula: "{amount} * 1.16" }, order: 1 }],
  });
  const fx = applyFormRules([r], ctxReferido);
  assert.equal(fx.fields.montoConIva.value, String(2000 * 1.16));
});

test("varias reglas sobre el mismo campo: la última (mayor prioridad) sobreescribe; mensajes se acumulan", () => {
  const base = regla({
    id: "a",
    priority: 1,
    actions: [
      { type: "requerir", params: { target: "email" }, order: 1 },
      { type: "mostrar_mensaje", params: { message: "m1" }, order: 2 },
    ],
  });
  const override = regla({
    id: "b",
    priority: 2,
    actions: [
      { type: "quitar_requerido", params: { target: "email" }, order: 1 },
      { type: "mostrar_mensaje", params: { message: "m2", tone: "warning" }, order: 2 },
    ],
  });
  const fx = applyFormRules([override, base], ctxReferido); // el orden de entrada no importa
  assert.equal(fx.fields.email.required, false);
  assert.deepEqual(fx.messages.map((m) => m.text), ["m1", "m2"]);
});

// ── computeValidationErrors ─────────────────────────────────────────────────

test("validación condicional: email obligatorio solo si origen = Sitio web", () => {
  const vr = regla({
    id: "v1",
    trigger: "form.validate",
    root: {
      operator: "AND",
      conditions: [
        { field: "source", op: "eq", value: "Sitio web" },
        { field: "email", op: "is_empty" },
      ],
      groups: [],
    },
    actions: [
      { type: "validation_error", params: { message: "El email es obligatorio para leads del sitio web." }, order: 1 },
    ],
  });

  const web = { ...ctxReferido, record: { ...ctxReferido.record, source: "Sitio web", email: "" } };
  assert.deepEqual(computeValidationErrors([vr], [], web), [
    "El email es obligatorio para leads del sitio web.",
  ]);

  const conEmail = { ...web, record: { ...web.record, email: "a@b.com" } };
  assert.deepEqual(computeValidationErrors([vr], [], conEmail), []);
  assert.deepEqual(computeValidationErrors([vr], [], ctxReferido), []); // origen Referido: no aplica
});

test("los requeridos de Form Rules también bloquean en servidor (campo oculto no bloquea)", () => {
  const requiereNotas = regla({
    id: "fr-req",
    root: {
      operator: "AND",
      conditions: [{ field: "source", op: "eq", value: "Referido" }],
      groups: [],
    },
    actions: [{ type: "requerir", params: { target: "notes" }, order: 1 }],
  });

  // notes vacío + requerido → error
  const errores = computeValidationErrors([], [requiereNotas], ctxReferido);
  assert.equal(errores.length, 1);
  assert.match(errores[0], /notes/);

  // con notas llenas → sin errores
  const ok = { ...ctxReferido, record: { ...ctxReferido.record, notes: "Lo refirió María" } };
  assert.deepEqual(computeValidationErrors([], [requiereNotas], ok), []);

  // requerido pero oculto → no bloquea
  const oculto = regla({
    id: "fr-req-oculto",
    priority: 2,
    root: requiereNotas.root,
    actions: [
      { type: "requerir", params: { target: "notes" }, order: 1 },
      { type: "ocultar", params: { target: "notes" }, order: 2 },
    ],
  });
  assert.deepEqual(computeValidationErrors([], [oculto], ctxReferido), []);
});
