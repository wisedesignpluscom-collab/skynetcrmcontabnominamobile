// Plan de servicios y servicios individuales (módulos puros, sin BD):
//   npx tsx tests/planes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ESTADOS_SERVICIO,
  esEstadoPlan,
  esEstadoServicio,
  planProduceTrabajo,
  siguienteEstadoServicio,
  servicioFacturable,
  totalPorMoneda,
  formatTotales,
} from "../lib/planes";
import { vencimientoDelPlan } from "../lib/fiscal/data";
import { claveDia } from "../lib/fiscal/vencimientos";

const iso = (d: Date | null) => (d ? claveDia(d) : null);

// ── Estados del plan ────────────────────────────────────────────────────────

test("el plan solo acepta sus tres estados", () => {
  assert.ok(esEstadoPlan("activo"));
  assert.ok(esEstadoPlan("pausado"));
  assert.equal(esEstadoPlan("vigente"), false, "estado inventado");
  assert.equal(esEstadoPlan(null), false);
});

test("solo el plan activo genera trabajo y factura", () => {
  assert.ok(planProduceTrabajo("activo"));
  assert.equal(planProduceTrabajo("pausado"), false);
  assert.equal(planProduceTrabajo("cancelado"), false);
  assert.equal(planProduceTrabajo(null), false);
});

// ── Flujo del servicio individual ───────────────────────────────────────────

test("el servicio avanza por su flujo hasta facturado", () => {
  assert.equal(siguienteEstadoServicio("cotizado"), "aprobado");
  assert.equal(siguienteEstadoServicio("aprobado"), "en_ejecucion");
  assert.equal(siguienteEstadoServicio("en_ejecucion"), "entregado");
  assert.equal(siguienteEstadoServicio("entregado"), "facturado");
  assert.equal(siguienteEstadoServicio("facturado"), null, "último paso");
  assert.equal(siguienteEstadoServicio("cualquiera"), null);
});

test("el flujo recorre los cinco estados sin saltarse ninguno", () => {
  const recorrido: string[] = ["cotizado"];
  let actual: string | null = "cotizado";
  while ((actual = siguienteEstadoServicio(actual!))) recorrido.push(actual);
  assert.deepEqual(recorrido, [...ESTADOS_SERVICIO]);
});

test("el servicio entregado es el que dispara la factura", () => {
  assert.ok(servicioFacturable("entregado"));
  assert.equal(servicioFacturable("en_ejecucion"), false);
  assert.equal(servicioFacturable("facturado"), false, "ya se facturó");
  assert.equal(esEstadoServicio("entregado"), true);
  assert.equal(esEstadoServicio("cobrado"), false);
});

// ── Totales por moneda ──────────────────────────────────────────────────────

test("los montos se suman por moneda, nunca mezclados", () => {
  const t = totalPorMoneda([
    { moneda: "USD", monto: 100 },
    { moneda: "Bs", monto: 500 },
    { moneda: "USD", monto: 50 },
  ]);
  assert.deepEqual(t, [
    { moneda: "Bs", total: 500 },
    { moneda: "USD", total: 150 },
  ]);
  assert.match(formatTotales(t), /Bs .*\+.*150/);
});

test("sin montos el total es cero en dólares", () => {
  assert.deepEqual(totalPorMoneda([]), []);
  assert.match(formatTotales([]), /\$/);
});

// ── Día acordado con el cliente ─────────────────────────────────────────────

// Contexto fiscal fabricado: sin feriados y con el calendario del SENIAT que
// haga falta. Evita la BD — lo que se prueba es la precedencia del override.
const ctx = { anio: 2026, feriados: new Set<string>(), calendario: [] };

test("el día acordado en el plan manda sobre la regla del catálogo", () => {
  const obligacion = { id: "obl-1", periodicidad: "mensual", reglaTipo: "dias_habiles", reglaParam: 5 };

  const sinOverride = vencimientoDelPlan(ctx, obligacion, null, "2026-07");
  assert.equal(iso(sinOverride.fecha), "2026-08-07", "cinco días hábiles de agosto");

  const conOverride = vencimientoDelPlan(ctx, obligacion, 20, "2026-07");
  assert.equal(iso(conOverride.fecha), "2026-08-20", "el día acordado");
});

test("el día acordado también corre al siguiente hábil si cae en fin de semana", () => {
  const v = vencimientoDelPlan(
    ctx,
    { id: "obl-1", periodicidad: "mensual", reglaTipo: "manual" },
    15,
    "2026-07"
  );
  assert.equal(iso(v.fecha), "2026-08-17", "el 15 de agosto es sábado");
});

test("un día acordado fuera de rango se ignora: vale la regla del catálogo", () => {
  const obligacion = { id: "obl-1", periodicidad: "mensual", reglaTipo: "dia_fijo", reglaParam: 10 };
  for (const invalido of [0, -3, 45]) {
    const v = vencimientoDelPlan(ctx, obligacion, invalido, "2026-07");
    assert.equal(iso(v.fecha), "2026-08-10", `día ${invalido}`);
  }
});

test("sin día acordado, una obligación manual sigue sin fecha", () => {
  const v = vencimientoDelPlan(ctx, { id: "obl-1", periodicidad: "anual", reglaTipo: "manual" }, null, "2026-12");
  assert.equal(v.fecha, null);
  assert.match(v.motivo ?? "", /analista/);
});
