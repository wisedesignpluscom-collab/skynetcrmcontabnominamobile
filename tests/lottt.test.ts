// Pruebas del módulo puro de cálculos LOTTT (sin BD ni Next):
//   npx tsx tests/lottt.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aniosServicioCompletos,
  aniosServicioParaPrestaciones,
  diasVacacionesLegal,
  diasBonoVacacionalLegal,
  mesesTrabajadosEnAnio,
  diasUtilidadesProporcional,
  salarioDiario,
  salarioIntegralDiario,
  prestacionesSocialesRetroactivo,
} from "../lib/lottt";

const D = (a: number, m: number, d: number) => new Date(a, m - 1, d, 12, 0, 0);

// ── Antigüedad ───────────────────────────────────────────────────────────

test("aniosServicioCompletos: exactamente un año en el aniversario", () => {
  assert.equal(aniosServicioCompletos(D(2024, 3, 10), D(2025, 3, 10)), 1);
  assert.equal(aniosServicioCompletos(D(2024, 3, 10), D(2025, 3, 9)), 0); // un día antes, aún no cumple
});

test("aniosServicioCompletos: nunca negativo antes de ingresar", () => {
  assert.equal(aniosServicioCompletos(D(2026, 1, 1), D(2025, 1, 1)), 0);
});

test("aniosServicioParaPrestaciones: redondea hacia arriba si la fracción supera 6 meses", () => {
  // 2 años y 7 meses → redondea a 3
  assert.equal(aniosServicioParaPrestaciones(D(2023, 1, 15), D(2025, 8, 20)), 3);
  // 2 años y 5 meses → se queda en 2
  assert.equal(aniosServicioParaPrestaciones(D(2023, 1, 15), D(2025, 6, 20)), 2);
  // exactamente 2 años → 2
  assert.equal(aniosServicioParaPrestaciones(D(2023, 1, 15), D(2025, 1, 15)), 2);
});

// ── Vacaciones y bono vacacional (Art. 190 / 192) ──────────────────────────

test("diasVacacionesLegal: sin un año cumplido no hay derecho", () => {
  assert.equal(diasVacacionesLegal(0), 0);
});

test("diasVacacionesLegal: 15 días al primer año, +1 por año hasta el tope de 30", () => {
  assert.equal(diasVacacionesLegal(1), 15);
  assert.equal(diasVacacionesLegal(2), 16);
  assert.equal(diasVacacionesLegal(5), 19);
  assert.equal(diasVacacionesLegal(16), 30);
  assert.equal(diasVacacionesLegal(25), 30); // tope, no sigue subiendo
});

test("diasBonoVacacionalLegal: misma fórmula que vacaciones", () => {
  assert.equal(diasBonoVacacionalLegal(1), 15);
  assert.equal(diasBonoVacacionalLegal(20), 30);
});

// ── Utilidades prorrateadas (Art. 131-132) ─────────────────────────────────

test("mesesTrabajadosEnAnio: año completo sin ingreso/egreso en el medio", () => {
  assert.equal(mesesTrabajadosEnAnio(null, null, 2026), 12);
});

test("mesesTrabajadosEnAnio: ingreso a mitad de año", () => {
  assert.equal(mesesTrabajadosEnAnio(D(2026, 7, 1), null, 2026), 6);
});

test("mesesTrabajadosEnAnio: egreso a mitad de año", () => {
  assert.equal(mesesTrabajadosEnAnio(null, D(2026, 3, 31), 2026), 3);
});

test("mesesTrabajadosEnAnio: fuera de rango del año da 0, nunca negativo", () => {
  assert.equal(mesesTrabajadosEnAnio(D(2027, 1, 1), null, 2026), 0);
});

test("diasUtilidadesProporcional: 30 días/año trabajados los 12 meses da 30", () => {
  assert.equal(diasUtilidadesProporcional(30, 12), 30);
});

test("diasUtilidadesProporcional: prorratea por mitad de año", () => {
  assert.equal(diasUtilidadesProporcional(30, 6), 15);
});

// ── Salario integral y prestaciones (Art. 142) ─────────────────────────────

test("salarioDiario: base mensual entre 30", () => {
  assert.equal(salarioDiario(900), 30);
});

test("salarioIntegralDiario: suma el diario más las alícuotas de utilidades y bono vacacional", () => {
  // diario = 30; alícuota utilidades = (30*30)/360 = 2.5; alícuota bono = (15*30)/360 = 1.25
  const integral = salarioIntegralDiario(900, 30, 15);
  assert.equal(Math.round(integral * 100) / 100, 33.75);
});

test("prestacionesSocialesRetroactivo: 30 días por año de servicio a salario integral", () => {
  const r = prestacionesSocialesRetroactivo({
    baseMensual: 900,
    fechaIngreso: D(2023, 1, 15),
    fechaEgreso: D(2026, 1, 15),
    diasUtilidadesAnio: 30,
    diasBonoVacacional: 15,
  });
  assert.equal(r.anios, 3);
  assert.equal(Math.round(r.salarioIntegralDiario * 100) / 100, 33.75);
  assert.equal(Math.round(r.monto * 100) / 100, 3037.5); // 30*3*33.75
});

test("prestacionesSocialesRetroactivo: sin antigüedad no genera monto", () => {
  const r = prestacionesSocialesRetroactivo({
    baseMensual: 900,
    fechaIngreso: D(2026, 1, 1),
    fechaEgreso: D(2026, 3, 1),
    diasUtilidadesAnio: 30,
    diasBonoVacacional: 15,
  });
  assert.equal(r.anios, 0);
  assert.equal(r.monto, 0);
});
