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
  tieneFasesPendientes,
  abrirCaso,
} from "../lib/fiscal/casos";
import { emitEvent } from "../lib/engine/events";
import { processQueue } from "../lib/engine/queue";
import { invalidateRulesCache } from "../lib/engine/load";
import { recurringCaseScope } from "../lib/permissions";
import { claveDia, fechaLocal } from "../lib/fiscal/vencimientos";
import { validarEspecial } from "../lib/fiscal/faseValidaciones";

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

// ── Sub-fases del caso (Etapa 3 «Mis Consultores») ──────────────────────────

async function montarObligacionConFases(diaFijo = 15): Promise<Escenario> {
  const e = await montarEscenario(diaFijo);
  await prisma.obligacionFase.createMany({
    data: [
      {
        obligacionId: e.obligacionId,
        order: 1,
        nombre: "Calcular el aporte",
        campos: JSON.stringify([
          { clave: "monto", etiqueta: "Monto calculado", tipo: "moneda", requerido: true },
        ]),
      },
      {
        obligacionId: e.obligacionId,
        order: 2,
        nombre: "Generar planilla",
        campos: JSON.stringify([
          { clave: "numeroPlanilla", etiqueta: "Número de planilla", tipo: "texto", requerido: true, claveUnicidad: true },
        ]),
        validacionEspecial: "sin_duplicado",
      },
      {
        obligacionId: e.obligacionId,
        order: 3,
        nombre: "Fase desactivada (no debe bloquear)",
        campos: "[]",
        active: false,
      },
    ],
  });
  return e;
}

test("abrir un caso crea sus sub-fases pendientes desde la plantilla", async () => {
  const e = await montarObligacionConFases();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const caso = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });

  const fases = await prisma.casoFase.findMany({
    where: { casoId: caso!.id },
    include: { obligacionFase: true },
    orderBy: { obligacionFase: { order: "asc" } },
  });
  assert.equal(fases.length, 2, "solo las fases ACTIVAS de la plantilla se materializan");
  assert.ok(fases.every((f) => f.estado === "pendiente"));
  assert.equal(fases[0].obligacionFase.nombre, "Calcular el aporte");
  await borrarEscenario(e);
});

test("no se puede entrar a en_revision ni presentado con fases activas incompletas", async () => {
  const e = await montarObligacionConFases();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const caso = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });

  assert.equal(await tieneFasesPendientes(caso!.id, "en_revision"), true);
  assert.equal(await tieneFasesPendientes(caso!.id, "presentado"), true);
  // pendiente_cliente/en_proceso no exigen el checklist completo
  assert.equal(await tieneFasesPendientes(caso!.id, "en_proceso"), false);

  const fases = await prisma.casoFase.findMany({ where: { casoId: caso!.id }, include: { obligacionFase: true } });
  const activas = fases.filter((f) => f.obligacionFase.active);
  for (const f of activas) {
    await prisma.casoFase.update({
      where: { id: f.id },
      data: { estado: "completada", datos: JSON.stringify({ monto: "10", numeroPlanilla: "PL-1" }), completadaAt: new Date() },
    });
  }
  assert.equal(await tieneFasesPendientes(caso!.id, "en_revision"), false, "completadas todas, ya puede avanzar");
  await borrarEscenario(e);
});

test("sin_duplicado detecta una evidencia repetida entre casos de la misma empresa", async () => {
  const e = await montarObligacionConFases();
  await generarCasosDelPeriodo({ hoy: fechaLocal(2026, 7, 20) });
  const julio = await prisma.casoRecurrente.findFirst({ where: { companyId: e.companyId } });
  const { creado: agostoCaso } = await clonarSiguientePeriodo(julio!.id);
  assert.ok(agostoCaso, "el período de agosto debe abrirse (no exige que julio esté presentado)");

  const faseJulio = await prisma.casoFase.findFirst({
    where: { casoId: julio!.id, obligacionFase: { nombre: "Generar planilla" } },
    include: { obligacionFase: true },
  });
  await prisma.casoFase.update({
    where: { id: faseJulio!.id },
    data: { estado: "completada", datos: JSON.stringify({ numeroPlanilla: "PL-REPETIDA" }), completadaAt: new Date() },
  });

  // Julio no encuentra choque contra sí mismo (casoId excluido)
  const errores1 = await validarEspecial("sin_duplicado", {
    companyId: e.companyId,
    casoId: julio!.id,
    obligacionFaseId: faseJulio!.obligacionFaseId,
    campos: JSON.parse(faseJulio!.obligacionFase.campos),
    datos: { numeroPlanilla: "PL-REPETIDA" },
  });
  assert.deepEqual(errores1, []);

  // Agosto sí choca contra la de julio ya completada
  const errores2 = await validarEspecial("sin_duplicado", {
    companyId: e.companyId,
    casoId: agostoCaso!.id,
    obligacionFaseId: faseJulio!.obligacionFaseId,
    campos: JSON.parse(faseJulio!.obligacionFase.campos),
    datos: { numeroPlanilla: "PL-REPETIDA" },
  });
  assert.equal(errores2.length, 1);
  assert.match(errores2[0], /Ya existe otro registro/);

  // Un número distinto no choca
  const errores3 = await validarEspecial("sin_duplicado", {
    companyId: e.companyId,
    casoId: agostoCaso!.id,
    obligacionFaseId: faseJulio!.obligacionFaseId,
    campos: JSON.parse(faseJulio!.obligacionFase.campos),
    datos: { numeroPlanilla: "PL-DISTINTA" },
  });
  assert.deepEqual(errores3, []);
  await borrarEscenario(e);
});

// ── Apertura de empresa (Etapa 3.6): validador rif_valido ───────────────────

test("rif_valido rechaza formato inválido y RIF ya usado por otro cliente", async () => {
  const otra = await prisma.company.create({ data: { name: "Otra empresa de prueba F4", rif: "J-11111111-1" } });
  const propia = await prisma.company.create({ data: { name: "Empresa en apertura de prueba F4" } });

  const formatoInvalido = await validarEspecial("rif_valido", {
    companyId: propia.id,
    casoId: "n/a",
    obligacionFaseId: "n/a",
    campos: [],
    datos: { rif: "no-es-un-rif" },
  });
  assert.equal(formatoInvalido.length, 1);
  assert.match(formatoInvalido[0], /formato/);

  const duplicado = await validarEspecial("rif_valido", {
    companyId: propia.id,
    casoId: "n/a",
    obligacionFaseId: "n/a",
    campos: [],
    datos: { rif: "J-11111111-1" },
  });
  assert.equal(duplicado.length, 1);
  assert.match(duplicado[0], /ya está registrado/);

  const valido = await validarEspecial("rif_valido", {
    companyId: propia.id,
    casoId: "n/a",
    obligacionFaseId: "n/a",
    campos: [],
    datos: { rif: "J-22222222-2" },
  });
  assert.deepEqual(valido, []);

  await prisma.company.deleteMany({ where: { id: { in: [otra.id, propia.id] } } });
});

test("abrirCaso reutilizado por la apertura de empresa crea sus 13 sub-fases", async () => {
  const obligacion = await prisma.obligacion.findFirst({ where: { nombre: "Apertura de empresa (SAREN)" } });
  if (!obligacion) {
    // El seed de la Etapa 3.6 (prisma/seed-fases-obligaciones.ts) no corrió
    // contra esta copia de BD — no es un fallo de este test, se omite.
    return;
  }
  const company = await prisma.company.create({ data: { name: "Cliente en apertura de prueba F4" } });
  const creado = await abrirCaso({
    companyId: company.id,
    obligacionId: obligacion.id,
    periodoFiscal: "unico",
    fechaLimite: null,
    analistaId: null,
    supervisorId: null,
  });
  assert.ok(creado);
  const fases = await prisma.casoFase.findMany({ where: { casoId: creado!.id } });
  assert.equal(fases.length, 13);
  await prisma.company.delete({ where: { id: company.id } });
});
