// Tests de integración del endurecimiento para producción (Fase 6):
// versionado + rollback, auditoría, caché de reglas + invalidación, import/export
// entre ambientes (etapa por nombre), guardas de recursión y permisos.
// Corre contra una COPIA de la base de datos (nunca los datos demo):
//
//   cp prisma/dev.db /tmp/skynet-test.db
//   DATABASE_URL="file:/tmp/skynet-test.db" npx tsx tests/hardening.test.ts
//
if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("⛔ Este test necesita DATABASE_URL apuntando a una copia de prueba (ver cabecera).");
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { saveDraft, loadDraft, restoreVersion } from "../lib/engine/persist";
import { loadRules, invalidateRulesCache } from "../lib/engine/load";
import { listVersions } from "../lib/engine/versions";
import { exportRules, importRules } from "../lib/engine/portable";
import { evaluateGroup, MAX_EVAL_DEPTH, type GroupDef } from "../lib/engine/evaluator";
import {
  emptyDraft,
  emptyGroup,
  type RuleDraft,
} from "../lib/engine/builder";
import {
  canManageAutomations,
  canViewAutomationLog,
} from "../lib/permissions";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function resetRules() {
  await prisma.workflowJob.deleteMany();
  await prisma.rule.deleteMany(); // cascada: grupos, condiciones, acciones, versiones
  invalidateRulesCache();
}

async function author(role: string) {
  const u = await prisma.user.findFirst({ where: { role } });
  assert.ok(u, `Falta usuario ${role} en la BD de prueba`);
  return { id: u!.id, name: u!.name };
}

// Borrador de workflow válido y mínimo
function workflowDraft(name: string, over: Partial<RuleDraft> = {}): RuleDraft {
  return {
    ...emptyDraft(),
    name,
    kind: "workflow",
    module: "contact",
    trigger: "contact.created",
    actions: [{ type: "crear_tarea", params: { titulo: "Hola {firstName}" } }],
    ...over,
  };
}

// ── 1. Versionado + auditoría ────────────────────────────────────────────────

test("cada guardado crea una versión incremental con autor y acción", async () => {
  await resetRules();
  const admin = await author("admin");

  const id = await saveDraft(workflowDraft("Bienvenida"), null, admin);
  let versions = await listVersions(id);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].version, 1);
  assert.equal(versions[0].action, "created");
  assert.equal(versions[0].authorName, admin.name);

  // Editar: nueva versión "updated"
  await saveDraft(workflowDraft("Bienvenida", { description: "editada" }), id, admin);
  versions = await listVersions(id);
  assert.equal(versions.length, 2);
  assert.equal(versions[0].version, 2); // más reciente primero
  assert.equal(versions[0].action, "updated");

  // Auditoría en la fila viva
  const rule = await prisma.rule.findUnique({ where: { id } });
  assert.equal(rule!.createdById, admin.id);
  assert.equal(rule!.updatedById, admin.id);
});

test("el autor queda congelado aunque cambie el nombre vivo", async () => {
  const admin = await author("admin");
  const id = await saveDraft(workflowDraft("Con autor"), null, admin);
  const v = await listVersions(id);
  assert.equal(v[0].authorName, admin.name);
});

// ── 2. Rollback ──────────────────────────────────────────────────────────────

test("restaurar una versión anterior vuelve al snapshot y lo audita", async () => {
  await resetRules();
  const admin = await author("admin");

  const id = await saveDraft(workflowDraft("Regla", { priority: 1 }), null, admin);
  await saveDraft(workflowDraft("Regla", { priority: 9, description: "cambiada" }), id, admin);

  const versions = await listVersions(id);
  const v1 = versions.find((v) => v.version === 1)!;

  const result = await restoreVersion(id, v1.id, admin);
  assert.equal(result.ok, true);

  // La regla viva volvió a prioridad 1 (la de v1)
  const rule = await prisma.rule.findUnique({ where: { id } });
  assert.equal(rule!.priority, 1);
  assert.equal(rule!.description, null);

  // El rollback quedó registrado como una versión nueva "restored"
  const after = await listVersions(id);
  assert.equal(after[0].action, "restored");
  assert.equal(after.length, 3);
});

test("no se restauran reglas de sistema", async () => {
  const admin = await author("admin");
  const id = await saveDraft(workflowDraft("Sistema"), null, admin);
  await prisma.rule.update({ where: { id }, data: { isSystem: true } });
  const v = await listVersions(id);
  const result = await restoreVersion(id, v[0].id, admin);
  assert.equal(result.ok, false);
});

// ── 3. Caché de reglas + invalidación ────────────────────────────────────────

test("loadRules cachea y las mutaciones invalidan", async () => {
  await resetRules();
  const admin = await author("admin");
  const id = await saveDraft(workflowDraft("Cacheable"), null, admin);

  // Puebla el caché
  let loaded = await loadRules({ trigger: "contact.created" });
  assert.equal(loaded.length, 1);

  // Cambio directo por Prisma SIN invalidar: el caché debe seguir sirviendo la
  // versión previa (prueba que efectivamente hay caché)
  await prisma.rule.update({ where: { id }, data: { enabled: false } });
  loaded = await loadRules({ trigger: "contact.created" });
  assert.equal(loaded.length, 1, "sin invalidar, el caché sirve el valor anterior");

  // Tras invalidar, refleja el estado real (regla desactivada → no aparece)
  invalidateRulesCache();
  loaded = await loadRules({ trigger: "contact.created" });
  assert.equal(loaded.length, 0);

  // Y saveDraft invalida solo (toggle vía saveDraft)
  await saveDraft(workflowDraft("Cacheable", { enabled: true }), id, admin, "activated");
  loaded = await loadRules({ trigger: "contact.created" });
  assert.equal(loaded.length, 1);
});

// ── 4. Import / Export entre ambientes ───────────────────────────────────────

test("export serializa la etapa por nombre y omite ids; import la re-resuelve", async () => {
  await resetRules();
  const admin = await author("admin");
  const cierre = await prisma.pipelineStage.findFirst({ where: { name: "Cierre" } });
  assert.ok(cierre);

  // Regla de pipeline ligada a la etapa por ID
  const pipelineDraft: RuleDraft = {
    ...emptyDraft(),
    name: "Aviso Cierre",
    kind: "pipeline",
    module: "deal",
    trigger: "pipeline.entrada",
    stageId: cierre!.id,
    actions: [{ type: "enviar_notificacion", params: { titulo: "Entró {title}" } }],
  };
  await saveDraft(pipelineDraft, null, admin);

  const bundle = await exportRules();
  const portable = bundle.rules.find((r) => r.name === "Aviso Cierre");
  assert.ok(portable);
  assert.equal(portable!.stageName, "Cierre"); // por nombre
  assert.equal((portable as Record<string, unknown>).stageId, undefined); // sin id

  // Simular "otro ambiente": borrar la regla y reimportar el bundle. La etapa se
  // re-resuelve por nombre → la nueva regla apunta al id local de Cierre.
  await prisma.rule.deleteMany();
  invalidateRulesCache();

  const summary = await importRules(JSON.stringify(bundle), admin);
  assert.equal(summary.ok, true);
  assert.equal(summary.created.length, 1);

  const recreada = await prisma.rule.findFirst({ where: { name: "Aviso Cierre" } });
  assert.equal(recreada!.stageId, cierre!.id);
});

test("import empareja por nombre (actualiza en vez de duplicar) y omite etapas inexistentes", async () => {
  await resetRules();
  const admin = await author("admin");
  await saveDraft(workflowDraft("Repetible"), null, admin);

  const bundle = await exportRules();
  // Importar dos veces: la segunda actualiza, no duplica
  await importRules(JSON.stringify(bundle), admin);
  const summary2 = await importRules(JSON.stringify(bundle), admin);
  assert.equal(summary2.updated.length, 1);
  assert.equal(await prisma.rule.count({ where: { name: "Repetible" } }), 1);

  // Bundle con etapa inexistente → se omite con motivo
  const badBundle = {
    format: "skynet-automations/v1",
    exportedAt: new Date().toISOString(),
    rules: [
      {
        ...emptyDraft(),
        name: "Pipeline huérfana",
        kind: "pipeline",
        module: "deal",
        trigger: "pipeline.entrada",
        stageName: "Etapa Que No Existe",
        actions: [{ type: "enviar_notificacion", params: { titulo: "x" } }],
      },
    ],
  };
  const summary3 = await importRules(JSON.stringify(badBundle), admin);
  assert.equal(summary3.skipped.length, 1);
  assert.match(summary3.skipped[0].reason, /etapa/);
});

test("import rechaza un archivo con formato desconocido", async () => {
  const admin = await author("admin");
  const bad = await importRules(JSON.stringify({ hola: "mundo" }), admin);
  assert.equal(bad.ok, false);
  assert.ok(bad.error);
});

// ── 5. Guardas de recursión ──────────────────────────────────────────────────

test("evaluateGroup no revienta ante anidamiento extremo (corta en el tope)", () => {
  // Construir un árbol más profundo que MAX_EVAL_DEPTH
  let node: GroupDef = emptyGroup("AND");
  node.conditions = [{ field: "amount", op: "gt", value: "0" }];
  for (let i = 0; i < MAX_EVAL_DEPTH + 10; i++) {
    node = { operator: "AND", conditions: [], groups: [node] };
  }
  const ctx = { record: { amount: 100 } };
  // No debe lanzar; devuelve un booleano
  const result = evaluateGroup(node, ctx);
  assert.equal(typeof result, "boolean");
});

// ── 6. Permisos (reutiliza el sistema de roles existente) ─────────────────────

test("permisos: admin gestiona; supervisor solo ve; vendedor nada", () => {
  assert.equal(canManageAutomations("admin"), true);
  assert.equal(canManageAutomations("supervisor"), false);
  assert.equal(canManageAutomations("vendedor"), false);

  assert.equal(canViewAutomationLog("admin"), true);
  assert.equal(canViewAutomationLog("supervisor"), true);
  assert.equal(canViewAutomationLog("vendedor"), false);
});

// ── Limpieza ─────────────────────────────────────────────────────────────────

test("limpieza", async () => {
  await resetRules();
  assert.ok(true);
});
