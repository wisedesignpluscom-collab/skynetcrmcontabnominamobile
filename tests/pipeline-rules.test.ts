// Tests de Pipeline Rules (Fase 5): requisitos que bloquean el movimiento,
// acciones al entrar/salir de una etapa, y verificación de NO-conflicto con
// los otros motores (workflows deal.*, reglas v1, Form/Validation Rules).
// Corre contra una COPIA de la base de datos (nunca contra los datos demo):
//
//   cp prisma/dev.db /tmp/skynet-test.db
//   DATABASE_URL="file:/tmp/skynet-test.db" npx tsx tests/pipeline-rules.test.ts
//
if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("⛔ Este test necesita DATABASE_URL apuntando a una copia de prueba (ver cabecera).");
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { applyStageMove, emitStageEvents, checkStageRequirements } from "../lib/deals";
import { invalidateRulesCache } from "../lib/engine/load";
import type { SessionUser } from "../lib/session";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function resetEngine() {
  await prisma.workflowJob.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.emailOutbox.deleteMany();
  await prisma.rule.deleteMany(); // cascada: grupos, condiciones, acciones
  invalidateRulesCache(); // escrituras directas de Prisma → refrescar el caché
}

async function stageByName(name: string) {
  const stage = await prisma.pipelineStage.findFirst({ where: { name } });
  assert.ok(stage, `Falta la etapa «${name}» en la BD de prueba`);
  return stage!;
}

async function userByRole(role: string): Promise<SessionUser> {
  const user = await prisma.user.findFirst({ where: { role } });
  assert.ok(user, `Falta un usuario con rol ${role} en la BD de prueba`);
  return { id: user!.id, name: user!.name, email: user!.email, role: user!.role };
}

type ConditionSeed = { field: string; op: string; value?: string };
type ActionSeed = { type: string; params: Record<string, unknown> };

async function createRule(opts: {
  name: string;
  trigger: string;
  stageId?: string;
  module?: string;
  conditions?: ConditionSeed[];
  actions: ActionSeed[];
}) {
  const rule = await prisma.rule.create({
    data: {
      name: opts.name,
      module: opts.module ?? "deal",
      trigger: opts.trigger,
      stageId: opts.stageId ?? null,
      actions: {
        create: opts.actions.map((a, i) => ({
          type: a.type,
          params: JSON.stringify(a.params),
          order: i + 1,
        })),
      },
    },
  });
  const group = await prisma.ruleGroup.create({ data: { ruleId: rule.id, operator: "AND" } });
  for (const [i, c] of (opts.conditions ?? []).entries()) {
    await prisma.ruleCondition.create({
      data: { groupId: group.id, field: c.field, op: c.op, value: c.value ?? null, order: i },
    });
  }
  invalidateRulesCache(); // regla creada por Prisma directo → refrescar caché
  return rule;
}

async function createTestDeal(stageId: string, amount: number) {
  const contact = await prisma.contact.create({
    data: { firstName: "Prueba", lastName: "Pipeline", email: "prueba@test.com" },
  });
  const deal = await prisma.deal.create({
    data: { title: "Oportunidad de prueba P5", amount, stageId, contactId: contact.id },
  });
  return { deal, contact };
}

async function jobsOf(ruleId: string) {
  return prisma.workflowJob.findMany({ where: { ruleId } });
}

// ── 1. Requisitos de etapa ───────────────────────────────────────────────────

test("requisito: bloquea la entrada con mensaje renderizado y no encola nada", async () => {
  await resetEngine();
  const calificacion = await stageByName("Calificación");
  const cierre = await stageByName("Cierre");
  const admin = await userByRole("admin");
  const { deal } = await createTestDeal(calificacion.id, 0);

  await createRule({
    name: "Cierre exige valor (test)",
    trigger: "pipeline.requisito",
    stageId: cierre.id,
    conditions: [{ field: "amount", op: "lte", value: "0" }],
    actions: [{ type: "bloquear_movimiento", params: { message: "«{title}» no tiene valor." } }],
  });

  const result = await applyStageMove(deal.id, cierre.id, admin);
  assert.equal(result.status, "blocked");
  assert.ok(result.status === "blocked" && result.messages[0].includes("«Oportunidad de prueba P5» no tiene valor."));

  const after = await prisma.deal.findUnique({ where: { id: deal.id } });
  assert.equal(after!.stageId, calificacion.id); // no se movió
  assert.equal(await prisma.workflowJob.count(), 0); // el bloqueo no encola acciones
});

test("requisito: deja pasar cuando la condición no se cumple", async () => {
  const calificacion = await stageByName("Calificación");
  const cierre = await stageByName("Cierre");
  const admin = await userByRole("admin");
  const { deal } = await createTestDeal(calificacion.id, 800);

  const result = await applyStageMove(deal.id, cierre.id, admin);
  assert.equal(result.status, "moved");
  const after = await prisma.deal.findUnique({ where: { id: deal.id } });
  assert.equal(after!.stageId, cierre.id);
});

test("requisito por rol: bloquea al vendedor y deja pasar al admin", async () => {
  await resetEngine();
  const calificacion = await stageByName("Calificación");
  const diagnostico = await stageByName("Diagnóstico");
  const vendedor = await userByRole("vendedor");
  const admin = await userByRole("admin");
  const { deal } = await createTestDeal(calificacion.id, 500);

  await createRule({
    name: "Solo supervisores mueven a Diagnóstico (test)",
    trigger: "pipeline.requisito",
    stageId: diagnostico.id,
    conditions: [{ field: "", op: "has_role", value: "vendedor" }],
    actions: [{ type: "bloquear_movimiento", params: { message: "Pide a tu supervisor este cambio." } }],
  });

  const bloqueado = await applyStageMove(deal.id, diagnostico.id, vendedor);
  assert.equal(bloqueado.status, "blocked");

  const permitido = await applyStageMove(deal.id, diagnostico.id, admin);
  assert.equal(permitido.status, "moved");
});

test("checkStageRequirements evalúa contra la etapa destino (helper puro-BD)", async () => {
  await resetEngine();
  const cierre = await stageByName("Cierre");
  const admin = await userByRole("admin");

  await createRule({
    name: "Requisito de valor (test)",
    trigger: "pipeline.requisito",
    stageId: cierre.id,
    conditions: [{ field: "amount", op: "lte", value: "0" }],
    actions: [{ type: "bloquear_movimiento", params: { message: "Sin valor." } }],
  });

  const sinValor = await checkStageRequirements(
    { title: "X", amount: 0 },
    { id: cierre.id, name: cierre.name },
    admin
  );
  assert.equal(sinValor.length, 1);

  const conValor = await checkStageRequirements(
    { title: "X", amount: 100 },
    { id: cierre.id, name: cierre.name },
    admin
  );
  assert.equal(conValor.length, 0);
});

// ── 2. Entrada / salida de etapa ─────────────────────────────────────────────

test("entrada/salida: cada regla dispara solo para SU etapa y solo una vez", async () => {
  await resetEngine();
  const calificacion = await stageByName("Calificación");
  const diagnostico = await stageByName("Diagnóstico");
  const cierre = await stageByName("Cierre");
  const admin = await userByRole("admin");
  const { deal } = await createTestDeal(calificacion.id, 900);

  const entradaNeg = await createRule({
    name: "Entrada a Cierre (test)",
    trigger: "pipeline.entrada",
    stageId: cierre.id,
    actions: [{ type: "enviar_notificacion", params: { titulo: "Entró {title}" } }],
  });
  const salidaCont = await createRule({
    name: "Salida de Calificación (test)",
    trigger: "pipeline.salida",
    stageId: calificacion.id,
    actions: [{ type: "enviar_notificacion", params: { titulo: "Salió {title}" } }],
  });

  // Calificación → Diagnóstico: sale de Calificación, NO entra a Cierre
  const r1 = await applyStageMove(deal.id, diagnostico.id, admin);
  assert.equal(r1.status, "moved");
  assert.equal((await jobsOf(salidaCont.id)).length, 1);
  assert.equal((await jobsOf(entradaNeg.id)).length, 0);

  // Diagnóstico → Cierre: entra a Cierre, la salida de Calificación no re-dispara
  const r2 = await applyStageMove(deal.id, cierre.id, admin);
  assert.equal(r2.status, "moved");
  assert.equal((await jobsOf(entradaNeg.id)).length, 1);
  assert.equal((await jobsOf(salidaCont.id)).length, 1); // sigue en 1
});

// ── 3. No-conflicto y no-duplicación entre motores ───────────────────────────

test("un movimiento: pipeline.entrada + deal.stage_changed disparan exactamente 1 vez cada uno; reordenar en la misma columna no dispara nada", async () => {
  await resetEngine();
  const calificacion = await stageByName("Calificación");
  const cierre = await stageByName("Cierre");
  const admin = await userByRole("admin");
  const { deal } = await createTestDeal(calificacion.id, 1200);

  const entrada = await createRule({
    name: "Entrada a Cierre (test)",
    trigger: "pipeline.entrada",
    stageId: cierre.id,
    actions: [{ type: "enviar_notificacion", params: { titulo: "entrada {title}" } }],
  });
  const cambio = await createRule({
    name: "Cualquier cambio de etapa (test)",
    trigger: "deal.stage_changed",
    actions: [{ type: "enviar_notificacion", params: { titulo: "cambio {title}" } }],
  });
  // Form/Validation Rules del mismo módulo: NUNCA deben correr por un cambio de etapa
  const validacion = await createRule({
    name: "Validación de deal (test)",
    trigger: "form.validate",
    module: "deal",
    actions: [{ type: "validation_error", params: { message: "no aplica aquí" } }],
  });
  const formulario = await createRule({
    name: "Form rule de deal (test)",
    trigger: "form.change",
    module: "deal",
    actions: [{ type: "mostrar_mensaje", params: { message: "no aplica aquí" } }],
  });

  const result = await applyStageMove(deal.id, cierre.id, admin);
  assert.equal(result.status, "moved");

  assert.equal((await jobsOf(entrada.id)).length, 1);
  assert.equal((await jobsOf(cambio.id)).length, 1);
  assert.equal((await jobsOf(validacion.id)).length, 0);
  assert.equal((await jobsOf(formulario.id)).length, 0);

  // Reordenar dentro de la misma columna (mismo stageId) no re-dispara nada
  const before = await prisma.workflowJob.count();
  const reorden = await applyStageMove(deal.id, cierre.id, admin);
  assert.equal(reorden.status, "moved");
  assert.equal(await prisma.workflowJob.count(), before);
});

test("regla v1 (seguimiento de propuestas) no duplica la tarea al re-entrar a la etapa", async () => {
  await resetEngine();
  const calificacion = await stageByName("Calificación");
  const propuesta = await stageByName("Propuesta");
  const admin = await userByRole("admin");
  const { deal } = await createTestDeal(calificacion.id, 700);

  await applyStageMove(deal.id, propuesta.id, admin);
  await applyStageMove(deal.id, calificacion.id, admin);
  await applyStageMove(deal.id, propuesta.id, admin); // re-entra

  const tareas = await prisma.task.findMany({
    where: { dealId: deal.id, done: false, title: { startsWith: "Seguimiento de propuesta" } },
  });
  assert.equal(tareas.length, 1); // el guard v1 evita el duplicado
});

// ── 4. Aprobaciones: intactas y ahora emiten eventos ─────────────────────────

test("vendedor → Perdido sigue creando solicitud (sin mover ni disparar eventos)", async () => {
  await resetEngine();
  const calificacion = await stageByName("Calificación");
  const perdido = await stageByName("Perdido");
  const vendedor = await userByRole("vendedor");
  const { deal } = await createTestDeal(calificacion.id, 300);

  const perdida = await createRule({
    name: "Al perder (test)",
    trigger: "deal.lost",
    actions: [{ type: "enviar_notificacion", params: { titulo: "perdida {title}" } }],
  });

  const result = await applyStageMove(deal.id, perdido.id, vendedor, "muy caro");
  assert.equal(result.status, "pending");

  const after = await prisma.deal.findUnique({ where: { id: deal.id } });
  assert.equal(after!.stageId, calificacion.id); // no se movió
  assert.equal(after!.pendingAction, "lost");
  assert.equal((await jobsOf(perdida.id)).length, 0); // la solicitud no dispara deal.lost
});

test("pérdida aprobada emite deal.lost + pipeline.entrada/salida (vía emitStageEvents)", async () => {
  const calificacion = await stageByName("Calificación");
  const perdido = await stageByName("Perdido");
  const supervisor = await userByRole("supervisor");

  const perdida = await prisma.rule.findFirst({ where: { name: "Al perder (test)" } });
  const salidaCont = await createRule({
    name: "Salida de Calificación al perder (test)",
    trigger: "pipeline.salida",
    stageId: calificacion.id,
    actions: [{ type: "enviar_notificacion", params: { titulo: "salió {title}" } }],
  });

  // La solicitud del test anterior sigue pendiente: replicar lo que hace
  // approveRequest (aplicar el cierre y emitir los eventos centralizados)
  const deal = await prisma.deal.findFirst({ where: { title: "Oportunidad de prueba P5", pendingAction: "lost" } });
  assert.ok(deal);
  await prisma.deal.update({
    where: { id: deal!.id },
    data: {
      stageId: perdido.id,
      status: "lost",
      closedAt: new Date(),
      pendingAction: null,
      pendingReason: null,
      pendingAt: null,
      pendingById: null,
    },
  });
  await emitStageEvents(
    deal!.id,
    { id: calificacion.id, name: calificacion.name },
    { id: perdido.id, name: perdido.name },
    supervisor
  );

  assert.equal((await jobsOf(perdida!.id)).length, 1); // deal.lost disparó una vez
  assert.equal((await jobsOf(salidaCont.id)).length, 1); // pipeline.salida de Calificación
});

// ── Limpieza ─────────────────────────────────────────────────────────────────

test("limpieza de datos de prueba", async () => {
  await resetEngine();
  await prisma.task.deleteMany({ where: { deal: { title: "Oportunidad de prueba P5" } } });
  await prisma.activity.deleteMany({ where: { deal: { title: "Oportunidad de prueba P5" } } });
  await prisma.deal.deleteMany({ where: { title: "Oportunidad de prueba P5" } });
  await prisma.contact.deleteMany({ where: { email: "prueba@test.com" } });
  assert.ok(true);
});
