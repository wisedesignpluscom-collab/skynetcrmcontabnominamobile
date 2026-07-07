// Tests del Workflow Engine (Fase 3): planificación, cola, reintentos,
// ejecutores y guards anti-bucle. Corre contra una COPIA de la base de datos
// (nunca contra los datos demo). Ejecutar con:
//
//   cp prisma/dev.db /tmp/nogui-test.db
//   DATABASE_URL="file:/tmp/nogui-test.db" npx tsx tests/workflow.test.ts
//
if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("⛔ Este test necesita DATABASE_URL apuntando a una copia de prueba (ver cabecera).");
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { prisma } from "../lib/prisma";
import { planJobs, waitMillis, emitEvent } from "../lib/engine/events";
import { renderTemplate } from "../lib/engine/actions";
import { processQueue, runEngineTick } from "../lib/engine/queue";
import { invalidateRulesCache } from "../lib/engine/load";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function resetEngine() {
  await prisma.workflowJob.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.emailOutbox.deleteMany();
  await prisma.rule.deleteMany(); // cascada: grupos, condiciones, acciones
  // Escrituras directas de Prisma (no pasan por saveDraft): refrescar el caché
  invalidateRulesCache();
}

// Adelanta todos los jobs pendientes (esperas/backoff) para poder procesarlos ya
async function fastForward() {
  await prisma.workflowJob.updateMany({
    where: { status: "pending" },
    data: { runAt: new Date(Date.now() - 1000) },
  });
}

type ActionSeed = { type: string; params: Record<string, unknown>; order: number };

async function createWorkflow(opts: {
  name: string;
  module: string;
  trigger: string;
  conditions?: { field: string; op: string; value?: string }[];
  actions: ActionSeed[];
}) {
  const rule = await prisma.rule.create({
    data: {
      name: opts.name,
      module: opts.module,
      trigger: opts.trigger,
      actions: {
        create: opts.actions.map((a) => ({
          type: a.type,
          params: JSON.stringify(a.params),
          order: a.order,
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

// ── 1. Módulo puro: planificación y plantillas ──────────────────────────────

test("waitMillis convierte días/horas/minutos", () => {
  assert.equal(waitMillis({ dias: 1 }), 86_400_000);
  assert.equal(waitMillis({ horas: 2, minutos: 30 }), 9_000_000);
  assert.equal(waitMillis({}), 0);
});

test("planJobs: «esperar» desplaza las acciones siguientes, no las previas", () => {
  const now = new Date("2026-07-07T10:00:00");
  const jobs = planJobs(
    [
      { type: "crear_tarea", params: {}, order: 1 },
      { type: "esperar", params: { dias: 2 }, order: 2 },
      { type: "enviar_notificacion", params: {}, order: 3 },
      { type: "esperar", params: { horas: 12 }, order: 4 },
      { type: "llamar_webhook", params: {}, order: 5 },
    ],
    now
  );
  assert.equal(jobs.length, 3); // esperar no genera job propio
  assert.equal(jobs[0].runAt.getTime(), now.getTime());
  assert.equal(jobs[1].runAt.getTime(), now.getTime() + 2 * 86_400_000);
  assert.equal(jobs[2].runAt.getTime(), now.getTime() + 2 * 86_400_000 + 12 * 3_600_000);
});

test("renderTemplate resuelve rutas anidadas y deja vacío lo inexistente", () => {
  const record = { title: "Asesoría contable", amount: 1200, contact: { firstName: "Yela" } };
  assert.equal(
    renderTemplate("{contact.firstName} cerró «{title}» por ${amount}", record),
    "Yela cerró «Asesoría contable» por $1200"
  );
  assert.equal(renderTemplate("[{no.existe}]", record), "[]");
});

// ── 2. Integración: evento → condiciones (Fase 1) → cola → acciones ─────────

test("workflow completo: contact.created crea tarea y notificación; la espera difiere", async () => {
  await resetEngine();
  await createWorkflow({
    name: "Bienvenida a referidos (test)",
    module: "contact",
    trigger: "contact.created",
    conditions: [{ field: "source", op: "eq", value: "Referido" }],
    actions: [
      { type: "crear_tarea", params: { titulo: "TEST bienvenida {firstName}", tipo: "Llamada", dias: 1 }, order: 1 },
      { type: "enviar_notificacion", params: { titulo: "TEST aviso {firstName}", url: "/tareas" }, order: 2 },
      { type: "esperar", params: { dias: 30 }, order: 3 },
      { type: "crear_tarea", params: { titulo: "TEST tardía {firstName}" }, order: 4 },
    ],
  });

  const contact = await prisma.contact.create({
    data: { firstName: "Prueba", lastName: "Workflow", source: "Referido" },
  });

  // Un contacto que NO cumple la condición no encola nada
  const otro = await prisma.contact.create({
    data: { firstName: "Otro", lastName: "Directo", source: "Sitio web" },
  });
  assert.equal(
    await emitEvent({ type: "contact.created", entity: "contact", entityId: otro.id, record: otro }),
    0
  );

  const enqueued = await emitEvent({
    type: "contact.created",
    entity: "contact",
    entityId: contact.id,
    record: contact,
  });
  assert.equal(enqueued, 3);

  await processQueue();

  // Las dos inmediatas corrieron; la diferida (30 días) sigue pendiente
  const ok = await prisma.workflowJob.findMany({ where: { status: "ok" } });
  assert.equal(ok.length, 2);
  const pendiente = await prisma.workflowJob.findFirst({ where: { status: "pending" } });
  assert.ok(pendiente && pendiente.runAt.getTime() > Date.now() + 29 * 86_400_000);

  const tarea = await prisma.task.findFirst({ where: { title: "TEST bienvenida Prueba" } });
  assert.ok(tarea, "la tarea de bienvenida existe");
  assert.equal(tarea!.contactId, contact.id);
  const aviso = await prisma.notification.findFirst({ where: { title: "TEST aviso Prueba" } });
  assert.ok(aviso, "la notificación existe");

  // La actividad de auditoría quedó en el historial del contacto
  const actividad = await prisma.activity.findFirst({
    where: { contactId: contact.id, content: { contains: "TEST bienvenida" } },
  });
  assert.ok(actividad, "la actividad de sistema existe");

  // Al «pasar el tiempo», la diferida corre
  await fastForward();
  await processQueue();
  assert.ok(await prisma.task.findFirst({ where: { title: "TEST tardía Prueba" } }));
  assert.equal(await prisma.workflowJob.count({ where: { status: "pending" } }), 0);
});

// ── 3. Webhook con reintentos y backoff ─────────────────────────────────────

test("llamar_webhook: reintenta con backoff y muere tras maxAttempts; el que responde 200 pasa", async () => {
  await resetEngine();

  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    if (req.url === "/falla") {
      res.writeHead(500).end("boom");
    } else {
      res.writeHead(200).end("ok");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;

  try {
    await createWorkflow({
      name: "Webhooks (test)",
      module: "company",
      trigger: "company.created",
      actions: [
        { type: "llamar_webhook", params: { url: `http://127.0.0.1:${port}/ok` }, order: 1 },
        { type: "llamar_webhook", params: { url: `http://127.0.0.1:${port}/falla` }, order: 2 },
      ],
    });

    const company = await prisma.company.create({ data: { name: "TEST Webhook SA" } });
    await emitEvent({ type: "company.created", entity: "company", entityId: company.id, record: company });

    await processQueue();
    const bueno = await prisma.workflowJob.findFirst({ where: { status: "ok" } });
    assert.ok(bueno?.detail?.includes("200"), "el webhook bueno registró 200");

    // El que falla quedó pendiente con backoff futuro y error registrado
    let malo = await prisma.workflowJob.findFirst({ where: { status: "pending" } });
    assert.ok(malo, "el fallido reintentará");
    assert.equal(malo!.attempts, 1);
    assert.ok(malo!.runAt.getTime() > Date.now(), "backoff en el futuro");
    assert.ok(malo!.lastError?.includes("500"));

    // Reintentos 2 y 3 → agota maxAttempts y queda en error definitivo
    await fastForward();
    await processQueue();
    await fastForward();
    await processQueue();
    malo = await prisma.workflowJob.findFirst({ where: { action: "llamar_webhook", status: "error" } });
    assert.ok(malo, "quedó en error tras agotar reintentos");
    assert.equal(malo!.attempts, 3);
    assert.equal(hits, 4); // 1 al bueno + 3 al que falla
  } finally {
    server.close();
  }
});

// ── 4. Errores no reintentables ─────────────────────────────────────────────

test("enviar_email con destinatario inválido falla sin reintentos; el válido va a la bandeja", async () => {
  await resetEngine();
  await createWorkflow({
    name: "Emails (test)",
    module: "contact",
    trigger: "contact.created",
    actions: [
      { type: "enviar_email", params: { para: "{email}", asunto: "Hola {firstName}", cuerpo: "Bienvenido" }, order: 1 },
    ],
  });

  const sinEmail = await prisma.contact.create({ data: { firstName: "Sin", lastName: "Correo" } });
  const conEmail = await prisma.contact.create({
    data: { firstName: "Con", lastName: "Correo", email: "test@ejemplo.com" },
  });
  await emitEvent({ type: "contact.created", entity: "contact", entityId: sinEmail.id, record: sinEmail });
  await emitEvent({ type: "contact.created", entity: "contact", entityId: conEmail.id, record: conEmail });

  await processQueue();

  const fallido = await prisma.workflowJob.findFirst({ where: { entityId: sinEmail.id } });
  assert.equal(fallido!.status, "error");
  assert.equal(fallido!.attempts, 1, "no reintenta un destinatario inválido");

  const correo = await prisma.emailOutbox.findFirst({ where: { to: "test@ejemplo.com" } });
  assert.ok(correo, "el email compuesto quedó en la bandeja de salida");
  assert.equal(correo!.subject, "Hola Con");
  assert.equal(correo!.status, "pendiente");
});

// ── 5. actualizar_campos: lista blanca ──────────────────────────────────────

test("actualizar_campos aplica campos permitidos y rechaza los sensibles", async () => {
  await resetEngine();
  const stage = await prisma.pipelineStage.findFirst({ where: { type: "open" } });
  assert.ok(stage, "la BD de prueba tiene etapas");

  await createWorkflow({
    name: "Actualizar probabilidad (test)",
    module: "deal",
    trigger: "deal.created",
    actions: [
      { type: "actualizar_campos", params: { campos: { probability: "80" } }, order: 1 },
      { type: "actualizar_campos", params: { campos: { amount: "1" } }, order: 2 }, // prohibido
    ],
  });

  const deal = await prisma.deal.create({
    data: { title: "TEST Whitelist", amount: 5000, stageId: stage!.id },
  });
  await emitEvent({ type: "deal.created", entity: "deal", entityId: deal.id, record: deal });
  await processQueue();

  const fresh = await prisma.deal.findUnique({ where: { id: deal.id } });
  assert.equal(fresh!.probability, 80);
  assert.equal(fresh!.amount, 5000, "amount es intocable por workflow");

  const rechazado = await prisma.workflowJob.findFirst({ where: { status: "error" } });
  assert.ok(rechazado?.lastError?.includes("amount"), "el campo prohibido quedó registrado como error");
});

// ── 6. Guard anti-bucles ────────────────────────────────────────────────────

test("una regla que se auto-dispara queda acotada por la profundidad máxima", async () => {
  await resetEngine();
  await createWorkflow({
    name: "Bucle (test)",
    module: "task",
    trigger: "task.created",
    actions: [{ type: "crear_tarea", params: { titulo: "TEST bucle" }, order: 1 }],
  });

  const task = await prisma.task.create({ data: { title: "TEST semilla" } });
  await emitEvent({ type: "task.created", entity: "task", entityId: task.id, record: task });

  // Procesar hasta vaciar la cola (cada tarea creada re-emite task.created)
  for (let i = 0; i < 10; i++) {
    await fastForward();
    if ((await processQueue()) === 0) break;
  }

  const creadas = await prisma.task.count({ where: { title: "TEST bucle" } });
  assert.ok(creadas > 0 && creadas <= 3, `cadena acotada por MAX_EVENT_DEPTH (creó ${creadas})`);
  assert.equal(await prisma.workflowJob.count({ where: { status: "pending" } }), 0);
});

// ── 7. Trigger de tiempo con dedupe de 24 h ─────────────────────────────────

test("tiempo.transcurrido: barre el módulo, encola una vez y no duplica en 24 h", async () => {
  await resetEngine();
  await prisma.automationRule.deleteMany({ where: { key: "workflow_tick_marker" } });

  await createWorkflow({
    name: "Deals grandes sin cerrar (test)",
    module: "deal",
    trigger: "tiempo.transcurrido",
    conditions: [
      { field: "status", op: "eq", value: "open" },
      { field: "amount", op: "gte", value: "99999" },
    ],
    actions: [{ type: "enviar_notificacion", params: { titulo: "TEST tiempo {title}" }, order: 1 }],
  });

  const stage = await prisma.pipelineStage.findFirst({ where: { type: "open" } });
  await prisma.deal.create({ data: { title: "TEST Gigante", amount: 150000, stageId: stage!.id } });

  await runEngineTick();
  assert.equal(await prisma.notification.count({ where: { title: "TEST tiempo TEST Gigante" } }), 1);

  // Segundo tick inmediato: ni el marker horario ni el dedupe de 24 h duplican
  await prisma.automationRule.deleteMany({ where: { key: "workflow_tick_marker" } });
  await runEngineTick();
  assert.equal(await prisma.workflowJob.count(), 1, "sin jobs duplicados");
});

// Cierre limpio de la conexión al terminar todos los tests
test("(cierre)", async () => {
  await prisma.$disconnect();
});
