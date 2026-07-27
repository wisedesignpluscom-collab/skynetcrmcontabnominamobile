// Motor de vencimientos fiscales (módulo puro, sin BD):
//   npx tsx tests/fiscal.test.ts
//
// Referencia de calendario usada en las pruebas (2026):
//   1-jul = miércoles · 16-jul = jueves · 1-ago = sábado · 3-ago = lunes
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addMonths,
  claveDia,
  diasDelMes,
  esDiaHabil,
  nDiaHabil,
  siguienteDiaHabil,
  parsePeriodo,
  formatPeriodo,
  etiquetaPeriodo,
  periodoSiguiente,
  calcularVencimiento,
  fechaLocal,
} from "../lib/fiscal/vencimientos";

const iso = (d: Date | null) => (d ? claveDia(d) : null);

// ── Aritmética de meses ─────────────────────────────────────────────────────

test("addMonths recorta al último día del mes destino", () => {
  assert.equal(iso(addMonths(fechaLocal(2026, 1, 31), 1)), "2026-02-28");
  assert.equal(iso(addMonths(fechaLocal(2024, 1, 31), 1)), "2024-02-29", "año bisiesto");
  assert.equal(iso(addMonths(fechaLocal(2026, 8, 31), 1)), "2026-09-30");
});

test("addMonths cruza el año en ambos sentidos", () => {
  assert.equal(iso(addMonths(fechaLocal(2026, 12, 15), 1)), "2027-01-15");
  assert.equal(iso(addMonths(fechaLocal(2026, 1, 15), -1)), "2025-12-15");
  assert.equal(iso(addMonths(fechaLocal(2026, 3, 10), 12)), "2027-03-10");
});

test("diasDelMes conoce febrero", () => {
  assert.equal(diasDelMes(2026, 2), 28);
  assert.equal(diasDelMes(2024, 2), 29);
  assert.equal(diasDelMes(2026, 9), 30);
});

// ── Períodos fiscales ───────────────────────────────────────────────────────

test("el período se lee y se vuelve a escribir igual", () => {
  assert.deepEqual(parsePeriodo("2026-07"), { anio: 2026, mes: 7 });
  assert.deepEqual(parsePeriodo("2026-07-Q2"), { anio: 2026, mes: 7, quincena: 2 });
  assert.equal(formatPeriodo({ anio: 2026, mes: 7 }), "2026-07");
  assert.equal(formatPeriodo({ anio: 2026, mes: 7, quincena: 1 }), "2026-07-Q1");
  assert.equal(parsePeriodo("2026-13"), null, "mes inexistente");
  assert.equal(parsePeriodo("julio"), null);
  assert.equal(parsePeriodo(null), null);
});

test("la etiqueta del período se lee en español", () => {
  assert.equal(etiquetaPeriodo("2026-07"), "Julio 2026");
  assert.equal(etiquetaPeriodo("2026-07-Q1"), "Julio 2026 · 1ª quincena");
});

test("el período siguiente avanza según la periodicidad y cruza el año", () => {
  assert.equal(periodoSiguiente("2026-07", "mensual"), "2026-08");
  assert.equal(periodoSiguiente("2026-12", "mensual"), "2027-01");
  assert.equal(periodoSiguiente("2026-10", "trimestral"), "2027-01");
  assert.equal(periodoSiguiente("2026-12", "anual"), "2027-12");
  assert.equal(periodoSiguiente("2026-07-Q1", "quincenal"), "2026-07-Q2");
  assert.equal(periodoSiguiente("2026-12-Q2", "quincenal"), "2027-01-Q1");
  assert.equal(periodoSiguiente("basura", "mensual"), null);
});

// ── Días hábiles ────────────────────────────────────────────────────────────

test("el fin de semana y los feriados no son hábiles", () => {
  assert.equal(esDiaHabil(fechaLocal(2026, 8, 1)), false, "sábado");
  assert.equal(esDiaHabil(fechaLocal(2026, 8, 2)), false, "domingo");
  assert.ok(esDiaHabil(fechaLocal(2026, 8, 3)), "lunes");
  assert.equal(esDiaHabil(fechaLocal(2026, 8, 3), ["2026-08-03"]), false, "lunes feriado");
});

test("siguienteDiaHabil salta el fin de semana y el feriado pegado", () => {
  assert.equal(iso(siguienteDiaHabil(fechaLocal(2026, 8, 1))), "2026-08-03");
  assert.equal(
    iso(siguienteDiaHabil(fechaLocal(2026, 8, 1), ["2026-08-03"])),
    "2026-08-04",
    "el lunes es feriado"
  );
  assert.equal(iso(siguienteDiaHabil(fechaLocal(2026, 8, 5))), "2026-08-05", "ya es hábil");
});

test("nDiaHabil cuenta desde el día indicado", () => {
  // Agosto 2026 arranca sábado: el primer hábil es el lunes 3
  assert.equal(iso(nDiaHabil(2026, 8, 1, 1)), "2026-08-03");
  assert.equal(iso(nDiaHabil(2026, 8, 1, 5)), "2026-08-07");
  // La segunda quincena de julio cuenta desde el día 16 (jueves)
  assert.equal(iso(nDiaHabil(2026, 7, 16, 2)), "2026-07-17");
});

// ── Cálculo del vencimiento por tipo de regla ───────────────────────────────

const feriados = ["2026-08-05"]; // feriado inventado, solo para la prueba

test("dias_habiles: cuenta en el mes siguiente al de cierre", () => {
  const v = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "dias_habiles", reglaParam: 5 },
    periodo: "2026-07",
  });
  assert.equal(iso(v.fecha), "2026-08-07");
});

test("dias_habiles: un feriado en medio corre la fecha", () => {
  const v = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "dias_habiles", reglaParam: 5 },
    periodo: "2026-07",
    feriados,
  });
  assert.equal(iso(v.fecha), "2026-08-10", "el miércoles 5 no cuenta");
});

test("dia_fijo: si cae en día no hábil pasa al siguiente hábil", () => {
  const enSabado = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "dia_fijo", reglaParam: 15 },
    periodo: "2026-07",
  });
  assert.equal(iso(enSabado.fecha), "2026-08-17", "el 15 de agosto es sábado");

  const habil = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "dia_fijo", reglaParam: 20 },
    periodo: "2026-07",
  });
  assert.equal(iso(habil.fecha), "2026-08-20");
});

test("dia_fijo: el día 31 se recorta en los meses de 30", () => {
  const v = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "dia_fijo", reglaParam: 31 },
    periodo: "2026-08", // vence en septiembre, de 30 días
  });
  assert.equal(iso(v.fecha), "2026-09-30");
});

test("quincenal: la primera quincena vence en su propio mes, la segunda en el siguiente", () => {
  const q1 = calcularVencimiento({
    obligacion: { periodicidad: "quincenal", reglaTipo: "dias_habiles", reglaParam: 2 },
    periodo: "2026-07-Q1",
  });
  assert.equal(iso(q1.fecha), "2026-07-17");

  const q2 = calcularVencimiento({
    obligacion: { periodicidad: "quincenal", reglaTipo: "dias_habiles", reglaParam: 2 },
    periodo: "2026-07-Q2",
  });
  assert.equal(iso(q2.fecha), "2026-08-04");
});

test("terminacion_rif: toma el día del calendario según el último dígito", () => {
  const v = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "terminacion_rif" },
    periodo: "2026-07",
    rif: "J-40123456-7",
    calendario: [
      { periodicidad: "mensual", digito: 7, diaDelMes: 12 },
      { periodicidad: "mensual", digito: 3, diaDelMes: 18 },
    ],
  });
  assert.equal(iso(v.fecha), "2026-08-12");
});

test("terminacion_rif: sin calendario cargado no inventa la fecha", () => {
  const v = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "terminacion_rif" },
    periodo: "2026-07",
    rif: "J-40123456-7",
    calendario: [],
  });
  assert.equal(v.fecha, null);
  assert.match(v.motivo ?? "", /calendario del SENIAT de 2026/);
  assert.match(v.motivo ?? "", /terminación 7/);
});

test("terminacion_rif: con RIF inválido pide el dato en vez de asumirlo", () => {
  const v = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "terminacion_rif" },
    periodo: "2026-07",
    rif: "pendiente",
    calendario: [{ periodicidad: "mensual", digito: 7, diaDelMes: 12 }],
  });
  assert.equal(v.fecha, null);
  assert.match(v.motivo ?? "", /RIF válido/);
});

test("terminacion_rif: si no hay fila de esa periodicidad usa la del dígito", () => {
  const v = calcularVencimiento({
    obligacion: { periodicidad: "quincenal", reglaTipo: "terminacion_rif" },
    periodo: "2026-07-Q2",
    rif: "J-40123456-7",
    calendario: [{ periodicidad: "mensual", digito: 7, diaDelMes: 12 }],
  });
  assert.equal(iso(v.fecha), "2026-08-12");
});

test("manual: devuelve null con su motivo, nunca una fecha", () => {
  const v = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "manual" },
    periodo: "2026-07",
  });
  assert.equal(v.fecha, null);
  assert.equal(v.regla, "manual");
  assert.match(v.motivo ?? "", /analista/);
});

test("una obligación mal configurada no revienta: avisa qué le falta", () => {
  const sinParam = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "dias_habiles", reglaParam: null },
    periodo: "2026-07",
  });
  assert.equal(sinParam.fecha, null);
  assert.match(sinParam.motivo ?? "", /cuántos días hábiles/);

  const periodoMalo = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "dia_fijo", reglaParam: 15 },
    periodo: "2026-99",
  });
  assert.equal(periodoMalo.fecha, null);
  assert.match(periodoMalo.motivo ?? "", /Período fiscal inválido/);
});

test("el vencimiento cruza el año: diciembre vence en enero", () => {
  const v = calcularVencimiento({
    obligacion: { periodicidad: "mensual", reglaTipo: "dia_fijo", reglaParam: 15 },
    periodo: "2026-12",
  });
  assert.equal(iso(v.fecha), "2027-01-15");
});
