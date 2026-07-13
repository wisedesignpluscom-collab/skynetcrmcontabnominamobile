// Tests del Automation Builder (Fase 4): validación pura del borrador y
// round-trip de persistencia (borrador → tablas → borrador / cargador del
// engine). Corre contra una COPIA de la base de datos:
//
//   cp prisma/dev.db /tmp/skynet-test.db
//   DATABASE_URL="file:/tmp/skynet-test.db" npx tsx tests/builder.test.ts
//
if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("⛔ Este test necesita DATABASE_URL apuntando a una copia de prueba (ver cabecera).");
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  emptyDraft,
  kindOfTrigger,
  validateDraft,
  type RuleDraft,
} from "../lib/engine/builder";
import { saveDraft, loadDraft } from "../lib/engine/persist";
import { loadRules } from "../lib/engine/load";
import { evaluateRule } from "../lib/engine/evaluator";

function draftBase(): RuleDraft {
  return {
    ...emptyDraft(),
    name: "Prueba builder",
    trigger: "contact.created",
    actions: [{ type: "crear_tarea", params: { titulo: "Llamar a {firstName}", dias: "1" } }],
  };
}

// ── Validación pura ──────────────────────────────────────────────────────────

test("un borrador completo pasa la validación", () => {
  assert.deepEqual(validateDraft(draftBase()), []);
});

test("se exigen nombre, acciones y evento coherente con el módulo", () => {
  const sinNombre = { ...draftBase(), name: "  " };
  assert.ok(validateDraft(sinNombre).some((e) => e.includes("nombre")));

  const sinAcciones = { ...draftBase(), actions: [] };
  assert.ok(validateDraft(sinAcciones).some((e) => e.includes("al menos una acción")));

  const moduloCruzado = { ...draftBase(), module: "deal" }; // trigger es contact.created
  assert.ok(validateDraft(moduloCruzado).some((e) => e.includes("no corresponde al módulo")));
});

test("condiciones incompletas y esperar al final se rechazan", () => {
  const draft = draftBase();
  draft.root = {
    operator: "AND",
    conditions: [{ field: "source", op: "eq", value: "" }],
    groups: [],
  };
  assert.ok(validateDraft(draft).some((e) => e.includes("necesita un valor")));

  const esperaFinal = draftBase();
  esperaFinal.actions.push({ type: "esperar", params: { dias: "3" } });
  assert.ok(validateDraft(esperaFinal).some((e) => e.includes("Esperar")));
});

test("las acciones se validan según el tipo de regla", () => {
  const formConWorkflowAction: RuleDraft = {
    ...draftBase(),
    kind: "form",
    trigger: "form.change",
    actions: [{ type: "crear_tarea", params: { titulo: "x" } }],
  };
  assert.ok(validateDraft(formConWorkflowAction).some((e) => e.includes("no existe")));

  const emailSinPara: RuleDraft = {
    ...draftBase(),
    actions: [{ type: "enviar_email", params: { asunto: "Hola" } }],
  };
  assert.ok(validateDraft(emailSinPara).some((e) => e.includes("Para")));
});

test("kindOfTrigger clasifica los cuatro tipos de regla", () => {
  assert.equal(kindOfTrigger("deal.won"), "workflow");
  assert.equal(kindOfTrigger("form.change"), "form");
  assert.equal(kindOfTrigger("form.validate"), "validation");
  assert.equal(kindOfTrigger("pipeline.requisito"), "pipeline");
  assert.equal(kindOfTrigger("pipeline.entrada"), "pipeline");
  assert.equal(kindOfTrigger("pipeline.salida"), "pipeline");
  assert.equal(kindOfTrigger(null), null);
  assert.equal(kindOfTrigger("cualquier.cosa"), null);
});

// ── Round-trip de persistencia ───────────────────────────────────────────────

test("guardar → cargar devuelve el mismo borrador (árbol anidado incluido)", async () => {
  await prisma.rule.deleteMany();

  const draft: RuleDraft = {
    name: "Ganadas grandes o de referidos",
    description: "Aviso para ventas > 5000 o cuyo contacto llegó referido",
    kind: "workflow",
    module: "deal",
    trigger: "deal.won",
    stageId: "",
    enabled: true,
    priority: 2,
    root: {
      operator: "OR",
      conditions: [{ field: "amount", op: "gt", value: "5000", value2: null }],
      groups: [
        {
          operator: "AND",
          conditions: [
            { field: "contact.email", op: "not_empty", value: null, value2: null },
            { field: "amount", op: "between", value: "1000", value2: "5000" },
          ],
          groups: [],
        },
      ],
    },
    actions: [
      { type: "enviar_notificacion", params: { titulo: "🎉 {title}", mensaje: "Ganada", url: "/pipeline" } },
      { type: "esperar", params: { dias: "7" } },
      { type: "crear_tarea", params: { titulo: "Seguimiento de {title}" } },
    ],
  };
  assert.deepEqual(validateDraft(draft), []);

  const id = await saveDraft(draft, null, null);
  const loaded = await loadDraft(id);
  assert.ok(loaded);
  assert.equal(loaded.isSystem, false);
  assert.deepEqual(loaded.draft, draft);

  // El cargador del engine (Fase 1) ve exactamente la misma estructura
  const [ruleDef] = await loadRules({ trigger: "deal.won" });
  assert.equal(ruleDef.name, draft.name);
  assert.equal(ruleDef.root?.operator, "OR");
  assert.equal(ruleDef.root?.groups[0].conditions.length, 2);
  assert.equal(ruleDef.actions.length, 3);

  // …y el evaluador la ejecuta como cualquier regla del engine
  const grande = evaluateRule(ruleDef, { record: { amount: 9000 } });
  assert.equal(grande.matched, true);
  const chicaSinEmail = evaluateRule(ruleDef, { record: { amount: 500, contact: {} } });
  assert.equal(chicaSinEmail.matched, false);
  const referidaMediana = evaluateRule(ruleDef, {
    record: { amount: 2000, contact: { email: "a@b.com" } },
  });
  assert.equal(referidaMediana.matched, true);
});

test("editar reemplaza el árbol y las acciones sin duplicar filas", async () => {
  await prisma.rule.deleteMany();

  const original = draftBase();
  const id = await saveDraft(original, null, null);

  const editado: RuleDraft = {
    ...original,
    name: "Prueba builder (editada)",
    enabled: false,
    root: {
      operator: "AND",
      conditions: [{ field: "source", op: "eq", value: "Referido", value2: null }],
      groups: [],
    },
    actions: [{ type: "enviar_notificacion", params: { titulo: "Hola" } }],
  };
  const sameId = await saveDraft(editado, id, null);
  assert.equal(sameId, id);

  const loaded = await loadDraft(id);
  assert.ok(loaded);
  assert.deepEqual(loaded.draft, editado);

  // Sin residuos: un solo grupo raíz, una condición, una acción
  assert.equal(await prisma.ruleGroup.count({ where: { ruleId: id } }), 1);
  assert.equal(await prisma.ruleCondition.count(), 1);
  assert.equal(await prisma.ruleAction.count({ where: { ruleId: id } }), 1);
});

test("una regla de formulario también sobrevive el round-trip", async () => {
  await prisma.rule.deleteMany();

  const draft: RuleDraft = {
    ...emptyDraft(),
    name: "Referidos exigen notas",
    kind: "form",
    trigger: "form.change",
    root: {
      operator: "AND",
      conditions: [{ field: "source", op: "eq", value: "Referido", value2: null }],
      groups: [],
    },
    actions: [
      { type: "requerir", params: { target: "notes" } },
      { type: "mostrar_mensaje", params: { message: "Anota quién lo refirió", tone: "info" } },
    ],
  };
  assert.deepEqual(validateDraft(draft), []);

  const id = await saveDraft(draft, null, null);
  const loaded = await loadDraft(id);
  assert.ok(loaded);
  assert.deepEqual(loaded.draft, draft);
});

test("al terminar: limpiar", async () => {
  await prisma.rule.deleteMany();
  assert.equal(await prisma.ruleGroup.count(), 0);
  await prisma.$disconnect();
});
