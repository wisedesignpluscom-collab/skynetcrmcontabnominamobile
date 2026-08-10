// Pruebas del módulo puro de operación de nómina (sin BD ni Next):
//   npx tsx tests/corridas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  periodoActualNomina,
  rangoPeriodoNomina,
  diasDelPeriodoNomina,
  periodoSiguienteNomina,
  periodoAnteriorNomina,
  etiquetaPeriodoNomina,
  auditarCorrida,
  baseProrrateada,
  mesDeclaracionDelPeriodo,
} from "../lib/corridas";
import { evaluarFormulaConcepto } from "../lib/formulasNomina";

// ── Períodos mensuales ──────────────────────────────────────────────────────

test("periodoActualNomina mensual: usa el mes de la fecha dada", () => {
  assert.equal(periodoActualNomina("mensual", new Date(2026, 6, 15)), "2026-07");
});

test("rangoPeriodoNomina mensual: día 1 al último día del mes", () => {
  const r = rangoPeriodoNomina("2026-02", "mensual")!;
  assert.equal(r.inicio.getDate(), 1);
  assert.equal(r.fin.getDate(), 28); // 2026 no es bisiesto
});

test("periodoSiguienteNomina/periodoAnteriorNomina mensual cruzan el año", () => {
  assert.equal(periodoSiguienteNomina("2026-12", "mensual"), "2027-01");
  assert.equal(periodoAnteriorNomina("2027-01", "mensual"), "2026-12");
});

// ── Períodos quincenales ────────────────────────────────────────────────────

test("periodoActualNomina quincenal: 1-15 vs 16-fin", () => {
  assert.equal(periodoActualNomina("quincenal", new Date(2026, 6, 10)), "2026-07-Q1");
  assert.equal(periodoActualNomina("quincenal", new Date(2026, 6, 20)), "2026-07-Q2");
});

test("rangoPeriodoNomina quincenal: Q1 es 1-15, Q2 es 16-fin de mes", () => {
  const q1 = rangoPeriodoNomina("2026-07-Q1", "quincenal")!;
  assert.equal(q1.inicio.getDate(), 1);
  assert.equal(q1.fin.getDate(), 15);
  const q2 = rangoPeriodoNomina("2026-02-Q2", "quincenal")!;
  assert.equal(q2.inicio.getDate(), 16);
  assert.equal(q2.fin.getDate(), 28);
});

test("periodoSiguienteNomina/periodoAnteriorNomina quincenal encadenan Q1→Q2→mes siguiente", () => {
  assert.equal(periodoSiguienteNomina("2026-07-Q1", "quincenal"), "2026-07-Q2");
  assert.equal(periodoSiguienteNomina("2026-07-Q2", "quincenal"), "2026-08-Q1");
  assert.equal(periodoAnteriorNomina("2026-08-Q1", "quincenal"), "2026-07-Q2");
  assert.equal(periodoAnteriorNomina("2026-07-Q2", "quincenal"), "2026-07-Q1");
});

// ── Períodos semanales ───────────────────────────────────────────────────────

test("periodoActualNomina semanal: identifica por el lunes de la semana", () => {
  // 13-ago-2026 es jueves → lunes es 10-ago-2026
  const periodo = periodoActualNomina("semanal", new Date(2026, 7, 13));
  assert.equal(periodo, "2026-08-10");
});

test("rangoPeriodoNomina/diasDelPeriodoNomina semanal: 7 días exactos, lunes a domingo", () => {
  const r = rangoPeriodoNomina("2026-08-10", "semanal")!;
  assert.equal(r.inicio.getDay(), 1); // lunes
  assert.equal(r.fin.getDay(), 0); // domingo
  const dias = diasDelPeriodoNomina("2026-08-10", "semanal");
  assert.equal(dias.length, 7);
});

test("periodoSiguienteNomina/periodoAnteriorNomina semanal avanzan 7 días", () => {
  assert.equal(periodoSiguienteNomina("2026-08-10", "semanal"), "2026-08-17");
  assert.equal(periodoAnteriorNomina("2026-08-17", "semanal"), "2026-08-10");
});

test("diasDelPeriodoNomina mensual: tantos días como tiene el mes", () => {
  assert.equal(diasDelPeriodoNomina("2026-04", "mensual").length, 30);
});

test("etiquetaPeriodoNomina: legible en los tres formatos", () => {
  assert.equal(etiquetaPeriodoNomina("2026-07", "mensual"), "Julio 2026");
  assert.ok(etiquetaPeriodoNomina("2026-07-Q1", "quincenal").includes("quincena"));
  assert.ok(etiquetaPeriodoNomina("2026-08-10", "semanal").startsWith("Semana"));
});

test("rangoPeriodoNomina: texto inválido devuelve null, nunca inventa un rango", () => {
  assert.equal(rangoPeriodoNomina("no-es-un-periodo", "mensual"), null);
  assert.equal(rangoPeriodoNomina("2026-13", "mensual"), null);
});

// ── Base declarada prorrateada ──────────────────────────────────────────────

test("baseProrrateada: mensual devuelve la base completa", () => {
  assert.equal(baseProrrateada(900, 30, 30), 900);
});

test("baseProrrateada: quincenal es aproximadamente la mitad", () => {
  assert.equal(baseProrrateada(900, 15, 30), 450);
});

test("baseProrrateada: semanal es proporcional a 7 días del mes", () => {
  assert.equal(Math.round(baseProrrateada(900, 7, 30) * 100) / 100, 210);
});

test("mesDeclaracionDelPeriodo: quincenal y semanal resuelven al mes que contiene su inicio", () => {
  assert.equal(mesDeclaracionDelPeriodo("2026-07-Q2", "quincenal"), "2026-07");
  assert.equal(mesDeclaracionDelPeriodo("2026-08-10", "semanal"), "2026-08");
  assert.equal(mesDeclaracionDelPeriodo("2026-07", "mensual"), "2026-07");
});

// ── Motor de auditoría ───────────────────────────────────────────────────────

test("auditarCorrida: sin corrida anterior nunca hay alerta", () => {
  assert.deepEqual(auditarCorrida({ totalNeto: 5000, totalNetoAnterior: null }), { alerta: false, detalle: null });
});

test("auditarCorrida: caída mayor al umbral dispara alerta", () => {
  const r = auditarCorrida({ totalNeto: 3000, totalNetoAnterior: 5000 });
  assert.equal(r.alerta, true);
  assert.match(r.detalle!, /cayó/);
});

test("auditarCorrida: subida mayor al umbral también alerta", () => {
  const r = auditarCorrida({ totalNeto: 8000, totalNetoAnterior: 5000 });
  assert.equal(r.alerta, true);
  assert.match(r.detalle!, /subió/);
});

test("auditarCorrida: variación dentro del umbral no alerta", () => {
  assert.equal(auditarCorrida({ totalNeto: 5200, totalNetoAnterior: 5000 }).alerta, false);
});

// ── Motor de fórmulas de conceptos ──────────────────────────────────────────

test("evaluarFormulaConcepto: hora extra diurna estándar", () => {
  // (600/30/8)*10*1.5 = 2.5*10*1.5 = 37.5
  const r = evaluarFormulaConcepto("(sueldo/30/8)*horas*1.5", { sueldo: 600, horas: 10 });
  assert.equal(r, 37.5);
});

test("evaluarFormulaConcepto: día feriado trabajado", () => {
  // (900/30)*2*2 = 30*2*2 = 120
  const r = evaluarFormulaConcepto("(sueldo/30)*dias*2", { sueldo: 900, dias: 2 });
  assert.equal(r, 120);
});

test("evaluarFormulaConcepto: fórmula vacía o inválida devuelve null, nunca inventa un monto", () => {
  assert.equal(evaluarFormulaConcepto("", { sueldo: 600 }), null);
  assert.equal(evaluarFormulaConcepto(null, { sueldo: 600 }), null);
  assert.equal(evaluarFormulaConcepto("sueldo * (horas", { sueldo: 600, horas: 1 }), null);
});

test("evaluarFormulaConcepto: variable no reconocida no revienta, produce null", () => {
  assert.equal(evaluarFormulaConcepto("sueldo * factor_raro", { sueldo: 600 }), null);
});
