// Tests unitarios del evaluador de reglas (módulo puro, sin base de datos).
// Ejecutar con:  npx tsx tests/evaluator.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCondition,
  evaluateGroup,
  evaluateRule,
  evaluateRules,
  getField,
  type RuleContext,
  type GroupDef,
  type RuleDef,
} from "../lib/engine/evaluator";

// ── Contexto base: una oportunidad de consultoría con su contacto ──────────
const NOW = new Date("2026-07-05T12:00:00");

const ctx: RuleContext = {
  record: {
    title: "Rediseño de procesos y manual de funciones",
    amount: 9500,
    status: "open",
    ownerId: "user_ana",
    expectedCloseDate: "2026-07-15T12:00:00",
    notes: "",
    contact: { email: "yrondon@ferreterialosandes.com", source: "Redes sociales" },
  },
  user: { id: "user_ana", role: "vendedor" },
  pipeline: { pipelineId: "default", stageId: "stage_prop", stageName: "Propuesta enviada" },
  now: NOW,
};

function group(operator: "AND" | "OR", conditions: GroupDef["conditions"], groups: GroupDef[] = []): GroupDef {
  return { operator, conditions, groups };
}

// ── getField ────────────────────────────────────────────────────────────────

test("getField resuelve rutas anidadas y rutas inexistentes", () => {
  assert.equal(getField(ctx.record, "amount"), 9500);
  assert.equal(getField(ctx.record, "contact.email"), "yrondon@ferreterialosandes.com");
  assert.equal(getField(ctx.record, "contact.telefono.inexistente"), undefined);
});

// ── Operadores básicos ──────────────────────────────────────────────────────

test("comparadores numéricos con coerción (el valor guardado es texto)", () => {
  assert.equal(evaluateCondition({ field: "amount", op: "gt", value: "5000" }, ctx), true);
  assert.equal(evaluateCondition({ field: "amount", op: "lt", value: "5000" }, ctx), false);
  assert.equal(evaluateCondition({ field: "amount", op: "gte", value: "9500" }, ctx), true);
  assert.equal(evaluateCondition({ field: "amount", op: "lte", value: "9499" }, ctx), false);
  assert.equal(evaluateCondition({ field: "amount", op: "eq", value: "9500" }, ctx), true);
  assert.equal(evaluateCondition({ field: "amount", op: "neq", value: "9500" }, ctx), false);
});

test("texto: contiene / empieza / termina, insensible a acentos y mayúsculas", () => {
  assert.equal(evaluateCondition({ field: "title", op: "contains", value: "REDISEÑO" }, ctx), true);
  assert.equal(evaluateCondition({ field: "title", op: "contains", value: "auditoría" }, ctx), false);
  assert.equal(evaluateCondition({ field: "title", op: "starts_with", value: "rediseño" }, ctx), true);
  assert.equal(evaluateCondition({ field: "title", op: "ends_with", value: "FUNCIONES" }, ctx), true);
  assert.equal(evaluateCondition({ field: "contact.source", op: "not_contains", value: "web" }, ctx), true);
});

test("está vacío / no está vacío (null, texto en blanco y campo inexistente)", () => {
  assert.equal(evaluateCondition({ field: "notes", op: "is_empty" }, ctx), true);
  assert.equal(evaluateCondition({ field: "title", op: "is_empty" }, ctx), false);
  assert.equal(evaluateCondition({ field: "campoInexistente", op: "is_empty" }, ctx), true);
  assert.equal(evaluateCondition({ field: "contact.email", op: "not_empty" }, ctx), true);
});

test("entre: numérico y de fechas", () => {
  assert.equal(evaluateCondition({ field: "amount", op: "between", value: "5000", value2: "10000" }, ctx), true);
  assert.equal(evaluateCondition({ field: "amount", op: "between", value: "10000", value2: "20000" }, ctx), false);
  assert.equal(
    evaluateCondition(
      { field: "expectedCloseDate", op: "between", value: "2026-07-01", value2: "2026-07-31" },
      ctx
    ),
    true
  );
});

test("fecha relativa: últimos N días, próximos N días y hoy", () => {
  // expectedCloseDate (15-jul) cae dentro de los próximos 30 días desde el 5-jul
  assert.equal(evaluateCondition({ field: "expectedCloseDate", op: "relative_date", value: "30" }, ctx), true);
  // …pero no dentro de los próximos 5 días
  assert.equal(evaluateCondition({ field: "expectedCloseDate", op: "relative_date", value: "5" }, ctx), false);
  // …ni en los últimos 30 días (es futura)
  assert.equal(evaluateCondition({ field: "expectedCloseDate", op: "relative_date", value: "-30" }, ctx), false);
  // 0 = mismo día calendario
  const hoy: RuleContext = { ...ctx, record: { ...ctx.record, expectedCloseDate: "2026-07-05T20:00:00" } };
  assert.equal(evaluateCondition({ field: "expectedCloseDate", op: "relative_date", value: "0" }, hoy), true);
});

test("operadores de contexto: usuario actual, rol, pipeline y etapa", () => {
  assert.equal(evaluateCondition({ field: "ownerId", op: "is_current_user" }, ctx), true);
  const otro: RuleContext = { ...ctx, user: { id: "user_otro", role: "vendedor" } };
  assert.equal(evaluateCondition({ field: "ownerId", op: "is_current_user" }, otro), false);

  assert.equal(evaluateCondition({ field: "", op: "has_role", value: "vendedor" }, ctx), true);
  assert.equal(evaluateCondition({ field: "", op: "has_role", value: "admin" }, ctx), false);

  assert.equal(evaluateCondition({ field: "", op: "in_pipeline", value: "default" }, ctx), true);
  // in_stage acepta id o nombre (insensible a acentos)
  assert.equal(evaluateCondition({ field: "", op: "in_stage", value: "stage_prop" }, ctx), true);
  assert.equal(evaluateCondition({ field: "", op: "in_stage", value: "propuesta ENVIADA" }, ctx), true);
  assert.equal(evaluateCondition({ field: "", op: "in_stage", value: "Negociación" }, ctx), false);

  const sinSesion: RuleContext = { ...ctx, user: null, pipeline: null };
  assert.equal(evaluateCondition({ field: "ownerId", op: "is_current_user" }, sinSesion), false);
  assert.equal(evaluateCondition({ field: "", op: "in_stage", value: "stage_prop" }, sinSesion), false);
});

// ── Árboles AND/OR anidados ─────────────────────────────────────────────────

test("AND simple: todas deben cumplirse", () => {
  const g = group("AND", [
    { field: "amount", op: "gt", value: "5000" },
    { field: "status", op: "eq", value: "open" },
  ]);
  assert.equal(evaluateGroup(g, ctx), true);

  g.conditions.push({ field: "notes", op: "not_empty" }); // falla
  assert.equal(evaluateGroup(g, ctx), false);
});

test("OR simple: basta una", () => {
  const g = group("OR", [
    { field: "amount", op: "lt", value: "100" }, // falso
    { field: "contact.source", op: "contains", value: "redes" }, // verdadero
  ]);
  assert.equal(evaluateGroup(g, ctx), true);
});

test("anidado nivel 2: A AND (B OR C)", () => {
  const g = group(
    "AND",
    [{ field: "status", op: "eq", value: "open" }], // A: verdadero
    [
      group("OR", [
        { field: "amount", op: "lt", value: "100" }, // B: falso
        { field: "", op: "in_stage", value: "Propuesta enviada" }, // C: verdadero
      ]),
    ]
  );
  assert.equal(evaluateGroup(g, ctx), true);
});

test("anidado nivel 3: (A OR (B AND C)) AND (D OR E) — y su negativo", () => {
  const arbol = group(
    "AND",
    [],
    [
      group(
        "OR",
        [{ field: "amount", op: "lt", value: "100" }], // A: falso
        [
          group("AND", [
            { field: "contact.email", op: "ends_with", value: ".com" }, // B: verdadero
            { field: "", op: "has_role", value: "vendedor" }, // C: verdadero
          ]),
        ]
      ),
      group("OR", [
        { field: "notes", op: "not_empty" }, // D: falso
        { field: "ownerId", op: "is_current_user" }, // E: verdadero
      ]),
    ]
  );
  assert.equal(evaluateGroup(arbol, ctx), true);

  // Mismo árbol evaluado por otro usuario: C y E se vuelven falsos → todo falso
  const otroUsuario: RuleContext = { ...ctx, user: { id: "user_otro", role: "admin" } };
  assert.equal(evaluateGroup(arbol, otroUsuario), false);
});

test("grupo vacío es verdadero (regla sin condiciones siempre aplica)", () => {
  assert.equal(evaluateGroup(group("AND", []), ctx), true);
  assert.equal(evaluateGroup(group("OR", []), ctx), true);
});

// ── evaluateRule / evaluateRules ────────────────────────────────────────────

const reglaDescuento: RuleDef = {
  id: "r1",
  name: "Descuento grande de vendedor requiere aprobación",
  module: "deal",
  trigger: "deal.updated",
  enabled: true,
  priority: 1,
  root: group("AND", [
    { field: "amount", op: "gte", value: "5000" },
    { field: "", op: "has_role", value: "vendedor" },
  ]),
  actions: [
    { type: "notificar", params: { a: "supervisor" }, order: 2 },
    { type: "requerir_aprobacion", params: {}, order: 1 },
  ],
};

test("regla que aplica devuelve sus acciones ordenadas", () => {
  const res = evaluateRule(reglaDescuento, ctx);
  assert.equal(res.matched, true);
  assert.deepEqual(
    res.actions.map((a) => a.type),
    ["requerir_aprobacion", "notificar"]
  );
});

test("regla desactivada nunca aplica", () => {
  const apagada = { ...reglaDescuento, enabled: false };
  const res = evaluateRule(apagada, ctx);
  assert.equal(res.matched, false);
  assert.equal(res.actions.length, 0);
});

test("evaluateRules: filtra las que no aplican y respeta prioridad", () => {
  const noAplica: RuleDef = {
    ...reglaDescuento,
    id: "r2",
    priority: 0,
    root: group("AND", [{ field: "status", op: "eq", value: "won" }]),
  };
  const sinCondiciones: RuleDef = {
    ...reglaDescuento,
    id: "r3",
    priority: 5,
    root: null,
    actions: [{ type: "registrar_actividad", params: {}, order: 1 }],
  };
  const resultados = evaluateRules([sinCondiciones, reglaDescuento, noAplica], ctx);
  assert.deepEqual(
    resultados.map((r) => r.ruleId),
    ["r1", "r3"] // r2 no aplica; r1 (prioridad 1) antes que r3 (prioridad 5)
  );
});
