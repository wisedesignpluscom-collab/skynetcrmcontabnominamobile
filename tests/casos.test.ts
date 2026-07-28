// Tests del loop mensual de obligaciones (F4): semáforo, generación de casos
// del período, clonado al presentar y guards contra duplicados. Corre contra una
// COPIA de la base de datos (nunca contra los datos demo). Ejecutar con:
//
//   cp prisma/dev.db /tmp/skynet-test.db
//   DATABASE_URL="file:/tmp/skynet-test.db" npx tsx tests/casos.test.ts
//
if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("⛔ Este test necesita DATABASE_URL apuntando a una copia de prueba (ver cabecera).");
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  diasHasta,
  semaforoCaso,
  siguienteEstadoCaso,
  debeMarcarseVencido,
  casoCerrado,
} from "../lib/casos";
import {
  generarCasosDelPeriodo,
  clonarSiguientePeriodo,
  marcarVencidos,
} from "../lib/fiscal/casos";
import { emitEvent } from "../lib/engine/events";
import { processQueue } from "../lib/engine/queue";
import { invalidateRulesCache } from "../lib/engine/load";
import { recurringCaseScope } from "../lib/permissions";
import { claveDia, fechaLocal } from "../lib/fiscal/vencimientos";

const iso = (d: Date | null | undefined) => (d ? claveDia(d) : null);

// ── Semáforo y ciclo de vida (puro) ─────────────────────────────────────────

const hoy = fechaLocal(2026, 8, 10);

test("el semáforo mide días completos, no horas", () => {
  assert.equal(diasHasta(fechaLocal(2026, 8, 10), hoy), 0, "hoy");
  assert.equal(diasHasta(fechaLocal(2026, 8, 13), hoy), 3);
  assert.equal(diasHasta(fechaLocal(2026, 8, 7), hoy), -3);
});

test("el semáforo distingue vencido, hoy, urgente, próximo y tranquilo", () => {
  const s = (dia: number) => semaforoCaso(fechaLocal(2026, 8, dia), "en_proceso", hoy);
  assert.equal(s(9), "vencido");
  assert.equal(s(10), "hoy");
  assert.equal(s(13), "urgente", "3 días");
  assert.equal(s(20), "proximo", "10 días");
  assert.equal(s(25), "tranquilo");
  assert.equal(semaforoCaso(null, "en_proceso", hoy), "sin_fecha");
});

test("un caso presentado no vence aunque su fecha haya pasado", () => {
  assert.equal(semaforoCaso(fechaLocal(2026, 7, 1), "presentado", hoy), "presentado");
  assert.equal(debeMarcarseVencido(fechaLocal(2026, 7, 1), "presentado", hoy), false);
  assert.ok(debeMarcarseVencido(fechaLocal(2026, 7, 1), "en_proceso", hoy));
  assert.equal(debeMarcarseVencido(fechaLocal(2026, 7, 1), "vencido", hoy), false, "ya está marcado");
  assert.equal(debeMarcarseVencido(null, "en_proceso", hoy), false);
  assert.ok(casoCerrado("presentado"));
});

test("el ciclo avanza y el vencido vuelve al flujo por «en proceso»", () => {
  assert.equal(siguienteEstadoCaso("pendiente_cliente"), "en_proceso");
  assert.equal(siguienteEstadoCaso("en_proceso"), "en_revision");
  assert.equal(siguienteEstadoCaso("en_revision"), "presentado");
  assert.equal(siguienteEstadoCaso("presentado"), null, "cerrado");
  assert.equal(siguienteEstadoCaso("vencido"), "en_proceso", "vencerse no exime de presentar");
});

// ── Escenario en base de datos ──────────────────────────────────────────────

type Escenario = {
  companyId: string;
  obligacionId: string;
  planId: string;
};

const RIF_PRUEBA = "J-99887766-5";
const OBLIGACION_PRUEBA = "Obligación de prueba F4";

async function limpiar() {
  await prisma.workflowJob.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.casoRecurrente.deleteMany();
  await prisma.planObligacion.deleteMany();
  await prisma.planServicio.deleteMany();
  await prisma.rule.deleteMany();
  // Restos de un escenario anterior que no alcanzó a borrarse (si una prueba
  // falla a mitad): sin esto, el RIF único haría caer en cadena a las que siguen.
  await prisma.obligacion.deleteMany({ where: { nombre: OBLIGACION_PRUEBA } });
  await prisma.company.deleteMany({ where: { rif: RIF_PRUEBA } });
  invalidateRulesCache();
}

// Cliente con RIF y plan activo con UNA obligación de día fijo (fecha siempre
// calculable, sin depender del calendario del SENIAT).
async function montarEscenario(diaFijo = 15): Promise<Escenario> {
  await limpiar();
  const company = await prisma.company.create({
    data: { name: "Cliente de prueba F4", rif: RIF_PRUEBA, estadoCliente: "activo" },
  });
  const obligacion = await prisma.obligacion.create({
    data: {
      nombre: OBLIGACION_PRUEBA,
      enteReceptor: "SENIAT",
      periodicidad: "mensual",
      reglaTipo: "dia_fijo",
      reglaParam: diaFijo,
    },
  });
  const plan = await prisma.planServicio.create({
    data: { companyId: company.id, honorarioMensual: 200, moneda: "USD", estado: "activo" },
  });
  await prisma.planObligacion.create({
    data: { planId: plan.id, obligacionId: obligacion.id },
  });
  return { companyId: company.id, obligacionId: obligacion.id, planId: plan.id };
}

async function borrarEscenario(e: Escenario) {
  await limpiar();
  await prisma.obligacion.deleteMany({ where: { id: e.obligacionId } });
  await prisma.company.deleteMany({ where: { id: e.companyId } });
}

test("generar casos del período abre uno por obligación contratada", async () => {
  const e = await montarEscenario();
  const res = await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  assert.equal(res.creados, 1);

  const caso = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });
  assert.equal(caso?.periodoFiscal, "2026-07");
  assert.equal(caso?.estado, "pendiente_cliente", "nace esperando al cliente");
  // Julio vence en agosto; el 15 de agosto de 2026 es sábado → lunes 17
  assert.equal(iso(caso?.fechaLimite), "2026-08-17");
  await borrarEscenario(e);
});

test("generar dos veces el mismo período no duplica nada", async () => {
  const e = await montarEscenario();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const segunda = await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });

  assert.equal(segunda.creados, 0);
  assert.equal(segunda.yaExistian, 1);
  assert.equal(await prisma.casoRecurrente.count({ where: { companyId: e.companyId } }), 1);
  await borrarEscenario(e);
});

test("un plan pausado no genera trabajo", async () => {
  const e = await montarEscenario();
  await prisma.planServicio.update({ where: { id: e.planId }, data: { estado: "pausado" } });

  const res = await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  assert.equal(res.creados, 0);
  assert.equal(await prisma.casoRecurrente.count({ where: { companyId: e.companyId } }), 0);
  await borrarEscenario(e);
});

test("una obligación sin fecha calculable abre el caso igual, avisando", async () => {
  const e = await montarEscenario();
  await prisma.obligacion.update({
    where: { id: e.obligacionId },
    data: { reglaTipo: "terminacion_rif", reglaParam: null },
  });
  // Sin calendario del SENIAT en absoluto: contextoFiscal carga el año Y el
  // siguiente, así que borrar solo uno dejaría el otro disponible.
  await prisma.calendarioSeniat.deleteMany();

  const res = await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  assert.equal(res.creados, 1);
  assert.equal(res.sinFecha, 1, "el caso existe, pero la fecha la pone el analista");
  assert.match(res.detalle[0] ?? "", /calendario del SENIAT/);

  const caso = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });
  assert.equal(caso?.fechaLimite, null);
  await borrarEscenario(e);
});

test("el día acordado en el plan manda sobre la regla del catálogo", async () => {
  const e = await montarEscenario();
  const po = await prisma.planObligacion.findFirst({ where: { planId: e.planId } });
  await prisma.planObligacion.update({ where: { id: po!.id }, data: { diaLimiteOverride: 20 } });

  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const caso = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });
  assert.equal(iso(caso?.fechaLimite), "2026-08-20");
  await borrarEscenario(e);
});

// ── Clonado del período siguiente ───────────────────────────────────────────

test("clonar abre el período siguiente con su fecha recalculada", async () => {
  const e = await montarEscenario();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const julio = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });

  const { creado } = await clonarSiguientePeriodo(julio!.id);
  assert.equal(creado?.periodoFiscal, "2026-08");
  // Agosto vence en septiembre; el 15 de septiembre de 2026 es martes
  assert.equal(iso(creado?.fechaLimite), "2026-09-15");

  const clon = await prisma.casoRecurrente.findUnique({ where: { id: creado!.id } });
  assert.equal(clon?.estado, "pendiente_cliente", "el clon NUNCA nace presentado");
  await borrarEscenario(e);
});

test("clonar dos veces el mismo caso no abre dos períodos", async () => {
  const e = await montarEscenario();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const julio = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });

  await clonarSiguientePeriodo(julio!.id);
  const segunda = await clonarSiguientePeriodo(julio!.id);

  assert.equal(segunda.creado, null);
  assert.match(segunda.motivo ?? "", /ya estaba abierto/);
  assert.equal(await prisma.casoRecurrente.count({ where: { companyId: e.companyId } }), 2);
  await borrarEscenario(e);
});

test("si el plan se pausa entre períodos, el loop se detiene solo", async () => {
  const e = await montarEscenario();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const julio = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });
  await prisma.planServicio.update({ where: { id: e.planId }, data: { estado: "cancelado" } });

  const res = await clonarSiguientePeriodo(julio!.id);
  assert.equal(res.creado, null);
  assert.match(res.motivo ?? "", /ya no está activo/);
  await borrarEscenario(e);
});

test("si la obligación sale del plan, deja de clonarse", async () => {
  const e = await montarEscenario();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const julio = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });
  await prisma.planObligacion.deleteMany({ where: { planId: e.planId } });

  const res = await clonarSiguientePeriodo(julio!.id);
  assert.equal(res.creado, null);
  assert.match(res.motivo ?? "", /ya no forma parte del plan/);
  await borrarEscenario(e);
});

// ── El loop completo, a través del Automation Engine ────────────────────────

test("presentar un caso abre el del período siguiente UNA sola vez", async () => {
  const e = await montarEscenario();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const julio = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });

  // La regla real del seed: caso.presentado → crear_registro caso_recurrente
  await prisma.rule.create({
    data: {
      name: "Loop mensual (prueba)",
      module: "caso_recurrente",
      trigger: "caso.presentado",
      actions: {
        create: [
          { type: "crear_registro", params: JSON.stringify({ entidad: "caso_recurrente" }), order: 1 },
        ],
      },
    },
  });
  invalidateRulesCache();

  const presentado = await prisma.casoRecurrente.update({
    where: { id: julio!.id },
    data: { estado: "presentado", fechaPresentacion: new Date() },
    include: { company: true, obligacion: true },
  });
  await emitEvent({
    type: "caso.presentado",
    entity: "caso_recurrente",
    entityId: presentado.id,
    record: presentado as unknown as Record<string, unknown>,
  });
  await processQueue();

  const casos = await prisma.casoRecurrente.findMany({
    where: { companyId: e.companyId },
    orderBy: { periodoFiscal: "asc" },
  });
  assert.equal(casos.length, 2, "julio presentado + agosto abierto");
  assert.deepEqual(
    casos.map((c) => `${c.periodoFiscal}:${c.estado}`),
    ["2026-07:presentado", "2026-08:pendiente_cliente"]
  );

  const jobs = await prisma.workflowJob.findMany();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, "ok");
  assert.match(jobs[0].detail ?? "", /2026-08/);
  await borrarEscenario(e);
});

test("el caso clonado no vuelve a disparar el loop (no hay cadena infinita)", async () => {
  const e = await montarEscenario();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const julio = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });

  // Regla que reacciona a caso.creado además de la del loop: si el clon naciera
  // «presentado», esta cadena no pararía.
  await prisma.rule.create({
    data: {
      name: "Loop mensual (prueba)",
      module: "caso_recurrente",
      trigger: "caso.presentado",
      actions: {
        create: [
          { type: "crear_registro", params: JSON.stringify({ entidad: "caso_recurrente" }), order: 1 },
        ],
      },
    },
  });
  invalidateRulesCache();

  const presentado = await prisma.casoRecurrente.update({
    where: { id: julio!.id },
    data: { estado: "presentado" },
    include: { company: true, obligacion: true },
  });
  await emitEvent({
    type: "caso.presentado",
    entity: "caso_recurrente",
    entityId: presentado.id,
    record: presentado as unknown as Record<string, unknown>,
  });
  // Varias pasadas: si hubiera cadena, seguiría abriendo períodos
  await processQueue();
  await processQueue();
  await processQueue();

  assert.equal(
    await prisma.casoRecurrente.count({ where: { companyId: e.companyId } }),
    2,
    "un período por presentación, ni uno más"
  );
  await borrarEscenario(e);
});

test("el barrido marca vencido lo que pasó su fecha sin presentarse", async () => {
  const e = await montarEscenario();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const caso = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });
  // Se le pone una fecha ya pasada respecto de hoy
  await prisma.casoRecurrente.update({
    where: { id: caso!.id },
    data: { fechaLimite: new Date(Date.now() - 3 * 86_400_000) },
  });

  const cambiados = await marcarVencidos();
  assert.equal(cambiados.length, 1);
  const vencido = await prisma.casoRecurrente.findUnique({ where: { id: caso!.id } });
  assert.equal(vencido?.estado, "vencido");

  // Segunda pasada: ya está marcado, no vuelve a cambiar nada
  assert.equal((await marcarVencidos()).length, 0);
  await borrarEscenario(e);
});

// ── Alcance por rol (lo consumen la bandeja y el calendario fiscal) ─────────

test("el analista solo ve los casos de su cartera; el admin, todos", async () => {
  const e = await montarEscenario();
  const analista = await prisma.user.findFirst({ where: { role: "vendedor" } });
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  assert.ok(analista && admin, "la copia de BD debe traer usuarios");

  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const sess = (u: NonNullable<typeof analista>) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  });

  // El cliente del escenario no tiene analista asignado ni contactos suyos
  assert.equal(
    await prisma.casoRecurrente.count({ where: recurringCaseScope(sess(analista!)) }),
    0,
    "un caso ajeno no se le muestra"
  );
  assert.equal(
    await prisma.casoRecurrente.count({ where: recurringCaseScope(sess(admin!)) }),
    1,
    "el admin ve todo"
  );

  // Al asignárselo, entra en su alcance
  await prisma.casoRecurrente.updateMany({
    where: { companyId: e.companyId },
    data: { analistaId: analista!.id },
  });
  assert.equal(
    await prisma.casoRecurrente.count({ where: recurringCaseScope(sess(analista!)) }),
    1
  );
  await borrarEscenario(e);
});

test("un caso presentado no lo toca el barrido de vencidos", async () => {
  const e = await montarEscenario();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const caso = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });
  await prisma.casoRecurrente.update({
    where: { id: caso!.id },
    data: { estado: "presentado", fechaLimite: new Date(Date.now() - 30 * 86_400_000) },
  });

  assert.equal((await marcarVencidos()).length, 0);
  await borrarEscenario(e);
});
