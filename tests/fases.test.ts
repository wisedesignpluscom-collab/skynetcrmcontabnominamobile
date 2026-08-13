// Tests de la checklist de fases por obligación: reglas puras (lib/fases.ts) +
// el bloqueo secuencial y el reabrir en cascada contra una BASE DE PRUEBA real
// (mismos efectos que hace fase-actions.ts, sin pasar por getSession/cookies —
// mismo principio que tests/portal.test.ts). Ejecutar con:
//
//   cp prisma/dev.db /tmp/skynet-test.db
//   DATABASE_URL="file:/tmp/skynet-test.db" npx tsx tests/fases.test.ts
//
if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("⛔ Este test necesita DATABASE_URL apuntando a una copia de prueba (ver cabecera).");
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  parseCampos,
  serializeCampos,
  parseValores,
  serializeValores,
  validarValoresFase,
  ensamblarFases,
  faseActiva,
  todasCompletadas,
  type CampoFase,
} from "../lib/fases";

// ── Módulo puro ──────────────────────────────────────────────────────────────

test("parseCampos descarta entradas malformadas y JSON inválido", () => {
  assert.deepEqual(parseCampos(null), []);
  assert.deepEqual(parseCampos("no es json"), []);
  assert.deepEqual(parseCampos("[]"), []);
  const campos: CampoFase[] = [{ id: "a", label: "A", tipo: "numero", requerido: true }];
  assert.deepEqual(parseCampos(serializeCampos(campos)), campos);
  // tipo desconocido → se descarta el campo, no revienta
  assert.deepEqual(parseCampos(JSON.stringify([{ id: "x", label: "X", tipo: "fantasia" }])), []);
});

test("parseValores/serializeValores hacen ida y vuelta", () => {
  const valores = { a: "1", b: "hola" };
  assert.deepEqual(parseValores(serializeValores(valores)), valores);
  assert.deepEqual(parseValores(null), {});
  assert.deepEqual(parseValores("[1,2,3]"), {}, "un array no es un objeto de valores");
});

test("validarValoresFase exige los campos requeridos y el tipo", () => {
  const campos: CampoFase[] = [
    { id: "monto", label: "Monto", tipo: "numero", requerido: true },
    { id: "fecha", label: "Fecha", tipo: "fecha", requerido: false },
    { id: "nota", label: "Nota", tipo: "texto", requerido: false },
  ];
  assert.deepEqual(Object.keys(validarValoresFase(campos, {})), ["monto"], "solo falla el requerido vacío");
  assert.deepEqual(
    Object.keys(validarValoresFase(campos, { monto: "abc" })),
    ["monto"],
    "no es un número"
  );
  assert.deepEqual(
    Object.keys(validarValoresFase(campos, { monto: "100", fecha: "no-es-fecha" })),
    ["fecha"]
  );
  assert.deepEqual(validarValoresFase(campos, { monto: "100" }), {}, "opcional vacío no falla");
});

test("faseActiva es la de menor orden sin progreso; null si ya están todas", () => {
  const base = (id: string, completada: boolean) => ({
    id,
    order: Number(id),
    nombre: id,
    descripcion: null,
    campos: [],
    completada,
    completedAt: null,
    completedByNombre: null,
    valores: {},
  });
  const f1 = [base("1", true), base("2", false), base("3", false)];
  assert.equal(faseActiva(f1)?.id, "2");
  assert.equal(faseActiva([base("1", true), base("2", true)]), null);
  assert.equal(faseActiva([]), null);
  assert.equal(todasCompletadas(f1), false);
  assert.equal(todasCompletadas([base("1", true)]), true);
  assert.equal(todasCompletadas([]), false, "sin plantilla no cuenta como completada");
});

test("ensamblarFases marca completada solo la fase con progreso propio", () => {
  const plantilla = [
    { id: "f1", order: 10, nombre: "Uno", descripcion: null, campos: "[]" },
    { id: "f2", order: 20, nombre: "Dos", descripcion: null, campos: "[]" },
  ];
  const progresos = [
    {
      faseObligacionId: "f1",
      completedAt: new Date("2026-08-01T12:00:00"),
      valores: "{}",
      completedBy: { name: "Ana" },
    },
  ];
  const fases = ensamblarFases(plantilla, progresos);
  assert.equal(fases[0].completada, true);
  assert.equal(fases[0].completedByNombre, "Ana");
  assert.equal(fases[1].completada, false);
});

// ── Integración: bloqueo secuencial y reabrir en cascada ────────────────────

const RIF_PRUEBA = "J-99988877-6";
const OBLIGACION_PRUEBA = "Obligación de prueba — fases";

async function limpiar() {
  await prisma.casoFaseProgreso.deleteMany({});
  await prisma.faseObligacion.deleteMany({ where: { obligacion: { nombre: OBLIGACION_PRUEBA } } });
  await prisma.casoRecurrente.deleteMany({ where: { company: { rif: RIF_PRUEBA } } });
  await prisma.obligacion.deleteMany({ where: { nombre: OBLIGACION_PRUEBA } });
  await prisma.company.deleteMany({ where: { rif: RIF_PRUEBA } });
}

async function montarEscenario() {
  await limpiar();
  const company = await prisma.company.create({
    data: { name: "Cliente de prueba fases", rif: RIF_PRUEBA, estadoCliente: "activo" },
  });
  const obligacion = await prisma.obligacion.create({
    data: { nombre: OBLIGACION_PRUEBA, enteReceptor: "SENIAT", periodicidad: "mensual", reglaTipo: "manual" },
  });
  const f1 = await prisma.faseObligacion.create({
    data: { obligacionId: obligacion.id, order: 10, nombre: "Paso 1", campos: "[]" },
  });
  const f2 = await prisma.faseObligacion.create({
    data: { obligacionId: obligacion.id, order: 20, nombre: "Paso 2", campos: "[]" },
  });
  const f3 = await prisma.faseObligacion.create({
    data: { obligacionId: obligacion.id, order: 30, nombre: "Paso 3", campos: "[]" },
  });
  const caso = await prisma.casoRecurrente.create({
    data: { companyId: company.id, obligacionId: obligacion.id, periodoFiscal: "2026-08" },
  });
  return { company, obligacion, f1, f2, f3, caso };
}

// Reproduce exactamente lo que hace completarFase (sin getSession/redirect).
async function intentarCompletar(casoId: string, obligacionId: string, faseId: string) {
  const [fases, progresos] = await Promise.all([
    prisma.faseObligacion.findMany({ where: { obligacionId }, orderBy: { order: "asc" } }),
    prisma.casoFaseProgreso.findMany({ where: { casoId } }),
  ]);
  const completadas = new Set(progresos.map((p) => p.faseObligacionId));
  const activa = fases.find((f) => !completadas.has(f.id));
  if (!activa || activa.id !== faseId) return { ok: false as const };
  await prisma.casoFaseProgreso.create({ data: { casoId, faseObligacionId: activa.id } });
  return { ok: true as const };
}

test("no se puede completar una fase salteando la anterior", async () => {
  const e = await montarEscenario();
  const r = await intentarCompletar(e.caso.id, e.obligacion.id, e.f2.id);
  assert.equal(r.ok, false);
  const progreso = await prisma.casoFaseProgreso.count({ where: { casoId: e.caso.id } });
  assert.equal(progreso, 0);
  await limpiar();
});

test("completar en orden avanza la fase activa una por una", async () => {
  const e = await montarEscenario();
  assert.equal((await intentarCompletar(e.caso.id, e.obligacion.id, e.f1.id)).ok, true);
  assert.equal((await intentarCompletar(e.caso.id, e.obligacion.id, e.f1.id)).ok, false, "no se repite la misma");
  assert.equal((await intentarCompletar(e.caso.id, e.obligacion.id, e.f3.id)).ok, false, "no se salta el paso 2");
  assert.equal((await intentarCompletar(e.caso.id, e.obligacion.id, e.f2.id)).ok, true);
  assert.equal((await intentarCompletar(e.caso.id, e.obligacion.id, e.f3.id)).ok, true);
  const total = await prisma.casoFaseProgreso.count({ where: { casoId: e.caso.id } });
  assert.equal(total, 3);
  await limpiar();
});

test("reabrir una fase borra también las posteriores", async () => {
  const e = await montarEscenario();
  await intentarCompletar(e.caso.id, e.obligacion.id, e.f1.id);
  await intentarCompletar(e.caso.id, e.obligacion.id, e.f2.id);
  await intentarCompletar(e.caso.id, e.obligacion.id, e.f3.id);

  // Reproduce reabrirFase: borra la fase reabierta y las de order >= la suya.
  const fases = await prisma.faseObligacion.findMany({
    where: { obligacionId: e.obligacion.id },
    orderBy: { order: "asc" },
  });
  const fase2 = fases.find((f) => f.id === e.f2.id)!;
  const idsPosteriores = fases.filter((f) => f.order >= fase2.order).map((f) => f.id);
  await prisma.casoFaseProgreso.deleteMany({ where: { casoId: e.caso.id, faseObligacionId: { in: idsPosteriores } } });

  const restantes = await prisma.casoFaseProgreso.findMany({ where: { casoId: e.caso.id } });
  assert.equal(restantes.length, 1);
  assert.equal(restantes[0].faseObligacionId, e.f1.id);

  // Y ahora la fase activa vuelve a ser la 2 — no se puede completar la 3 todavía.
  assert.equal((await intentarCompletar(e.caso.id, e.obligacion.id, e.f3.id)).ok, false);
  assert.equal((await intentarCompletar(e.caso.id, e.obligacion.id, e.f2.id)).ok, true);
  await limpiar();
});

test("borrar el caso borra en cascada su progreso de fases", async () => {
  const e = await montarEscenario();
  await intentarCompletar(e.caso.id, e.obligacion.id, e.f1.id);
  await prisma.casoRecurrente.delete({ where: { id: e.caso.id } });
  const restante = await prisma.casoFaseProgreso.count({ where: { faseObligacionId: e.f1.id } });
  assert.equal(restante, 0);
  await limpiar();
});

test("el índice único impide duplicar el progreso de una misma fase", async () => {
  const e = await montarEscenario();
  await prisma.casoFaseProgreso.create({ data: { casoId: e.caso.id, faseObligacionId: e.f1.id } });
  await assert.rejects(
    prisma.casoFaseProgreso.create({ data: { casoId: e.caso.id, faseObligacionId: e.f1.id } })
  );
  await limpiar();
});
