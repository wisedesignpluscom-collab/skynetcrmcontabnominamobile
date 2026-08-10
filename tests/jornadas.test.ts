// Pruebas del módulo puro de jornadas (sin BD ni Next):
//   npx tsx tests/jornadas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esFrecuenciaPago,
  minutosDesde,
  horasEfectivas,
  DIAS_SEMANA,
  PRESETS_DIAS,
} from "../lib/jornadas";

test("esFrecuenciaPago: acepta solo el catálogo", () => {
  assert.ok(esFrecuenciaPago("mensual"));
  assert.ok(esFrecuenciaPago("quincenal"));
  assert.ok(esFrecuenciaPago("semanal"));
  assert.equal(esFrecuenciaPago("diaria"), false);
  assert.equal(esFrecuenciaPago(null), false);
});

test("minutosDesde: parsea HH:mm y rechaza formatos inválidos", () => {
  assert.equal(minutosDesde("08:00"), 480);
  assert.equal(minutosDesde("23:59"), 1439);
  assert.equal(minutosDesde("0:00"), 0);
  assert.equal(minutosDesde("24:00"), null);
  assert.equal(minutosDesde("8am"), null);
  assert.equal(minutosDesde(null), null);
});

test("horasEfectivas: jornada diurna simple con descanso", () => {
  // 8:00 a 17:00 con 60 min de descanso = 8 horas efectivas
  assert.equal(horasEfectivas("08:00", "17:00", 60), 8);
});

test("horasEfectivas: sin descanso", () => {
  assert.equal(horasEfectivas("08:00", "12:00", 0), 4);
});

test("horasEfectivas: jornada nocturna que cruza medianoche", () => {
  // 22:00 a 06:00 = 8 horas, menos 30 min de descanso = 7.5
  assert.equal(horasEfectivas("22:00", "06:00", 30), 7.5);
});

test("horasEfectivas: descanso mayor al total no da negativo", () => {
  assert.equal(horasEfectivas("08:00", "09:00", 120), 0);
});

test("horasEfectivas: hora inválida devuelve null, nunca inventa un número", () => {
  assert.equal(horasEfectivas("25:00", "17:00", 0), null);
  assert.equal(horasEfectivas(null, "17:00", 0), null);
});

test("PRESETS_DIAS: los presets están hechos de códigos válidos", () => {
  for (const dias of Object.values(PRESETS_DIAS)) {
    for (const d of dias) assert.ok((DIAS_SEMANA as readonly string[]).includes(d));
  }
  assert.deepEqual(PRESETS_DIAS["L-V"], ["L", "M", "X", "J", "V"]);
  assert.equal(PRESETS_DIAS.Todos.length, 7);
});
