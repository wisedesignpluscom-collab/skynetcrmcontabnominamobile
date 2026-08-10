// Pruebas del módulo puro de nómina/riesgo FAO (sin BD ni Next):
//   npx tsx tests/nomina.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esEstadoDeclaracion,
  esMotivoRiesgo,
  salarioMinimoVigente,
  evaluarRiesgoAutomatico,
  siguienteEstadoDeclaracion,
  declaracionCerrada,
  DEFAULT_CONFIG_RIESGO_NOMINA,
} from "../lib/nomina";

// ── Estados y motivos ───────────────────────────────────────────────────────

test("estado de declaración: acepta el flujo y 'bloqueada' aunque quede fuera del arreglo", () => {
  assert.ok(esEstadoDeclaracion("pendiente"));
  assert.ok(esEstadoDeclaracion("en_revision"));
  assert.ok(esEstadoDeclaracion("aprobada"));
  assert.ok(esEstadoDeclaracion("bloqueada"));
  assert.equal(esEstadoDeclaracion("inventado"), false);
  assert.equal(esEstadoDeclaracion(null), false);
});

test("siguienteEstadoDeclaracion: recorre pendiente → en_revision → aprobada sin saltos", () => {
  assert.equal(siguienteEstadoDeclaracion("pendiente"), "en_revision");
  assert.equal(siguienteEstadoDeclaracion("en_revision"), "aprobada");
  assert.equal(siguienteEstadoDeclaracion("aprobada"), null, "aprobada es un estado final");
});

test("siguienteEstadoDeclaracion: bloqueada solo se resuelve a en_revision, nunca a aprobada directo", () => {
  assert.equal(siguienteEstadoDeclaracion("bloqueada"), "en_revision");
});

test("siguienteEstadoDeclaracion: un estado desconocido no avanza a ningún lado", () => {
  assert.equal(siguienteEstadoDeclaracion("inventado"), null);
});

test("declaracionCerrada: solo 'aprobada' cuenta como lista para Galac", () => {
  assert.equal(declaracionCerrada("aprobada"), true);
  assert.equal(declaracionCerrada("en_revision"), false);
  assert.equal(declaracionCerrada("bloqueada"), false);
  assert.equal(declaracionCerrada("pendiente"), false);
});

test("motivo de riesgo: solo los tres del catálogo", () => {
  assert.ok(esMotivoRiesgo("bajo_minimo"));
  assert.ok(esMotivoRiesgo("caida_periodo"));
  assert.ok(esMotivoRiesgo("manual"));
  assert.equal(esMotivoRiesgo("otro"), false);
});

// ── Salario mínimo vigente ──────────────────────────────────────────────────

test("salarioMinimoVigente: elige el más reciente que no supere la fecha", () => {
  const historial = [
    { vigenteDesde: new Date(2026, 0, 1), monto: 100 },
    { vigenteDesde: new Date(2026, 5, 1), monto: 130 },
    { vigenteDesde: new Date(2026, 9, 1), monto: 160 }, // futuro respecto a la fecha de prueba
  ];
  const v = salarioMinimoVigente(historial, new Date(2026, 6, 15));
  assert.equal(v?.monto, 130);
});

test("salarioMinimoVigente: sin datos o todos en el futuro, devuelve null (nunca inventa)", () => {
  assert.equal(salarioMinimoVigente([], new Date()), null);
  const soloFuturo = [{ vigenteDesde: new Date(2099, 0, 1), monto: 999 }];
  assert.equal(salarioMinimoVigente(soloFuturo, new Date(2026, 0, 1)), null);
});

// ── Heurísticas automáticas ─────────────────────────────────────────────────

test("evaluarRiesgoAutomatico: base bajo el mínimo dispara bajo_minimo", () => {
  const r = evaluarRiesgoAutomatico({
    baseDeclarada: 80,
    salarioMinimo: { vigenteDesde: new Date(), monto: 130 },
    baseAnterior: null,
  });
  assert.equal(r.riesgo, true);
  assert.deepEqual(r.motivos, ["bajo_minimo"]);
});

test("evaluarRiesgoAutomatico: caída de 20%+ contra el período anterior dispara caida_periodo", () => {
  const r = evaluarRiesgoAutomatico({
    baseDeclarada: 79,
    salarioMinimo: null,
    baseAnterior: 100,
    config: { umbralCaidaPeriodo: 0.2 },
  });
  assert.equal(r.riesgo, true);
  assert.deepEqual(r.motivos, ["caida_periodo"]);
});

test("evaluarRiesgoAutomatico: caída justo en el umbral (exactamente 20%) NO dispara — hay que superarlo", () => {
  const r = evaluarRiesgoAutomatico({
    baseDeclarada: 80,
    salarioMinimo: null,
    baseAnterior: 100,
    config: { umbralCaidaPeriodo: 0.2 },
  });
  assert.equal(r.riesgo, false);
});

test("evaluarRiesgoAutomatico: sin dato de referencia no hay heurística que evaluar", () => {
  const r = evaluarRiesgoAutomatico({ baseDeclarada: 10, salarioMinimo: null, baseAnterior: null });
  assert.equal(r.riesgo, false);
  assert.deepEqual(r.motivos, []);
});

test("evaluarRiesgoAutomatico: ambas heurísticas pueden combinarse", () => {
  const r = evaluarRiesgoAutomatico({
    baseDeclarada: 50,
    salarioMinimo: { vigenteDesde: new Date(), monto: 130 },
    baseAnterior: 200,
  });
  assert.equal(r.riesgo, true);
  assert.deepEqual(r.motivos, ["bajo_minimo", "caida_periodo"]);
});

test("evaluarRiesgoAutomatico: usa el umbral por defecto si no se pasa config", () => {
  assert.equal(DEFAULT_CONFIG_RIESGO_NOMINA.umbralCaidaPeriodo, 0.2);
  const r = evaluarRiesgoAutomatico({ baseDeclarada: 79, salarioMinimo: null, baseAnterior: 100 });
  assert.equal(r.riesgo, true);
});
