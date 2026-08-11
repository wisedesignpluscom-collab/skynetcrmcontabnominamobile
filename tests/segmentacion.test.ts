// Matriz de segmentación rentabilidad × cumplimiento (Etapa 4 «Mis
// Consultores»). Módulo puro — sin BD.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularSegmento,
  esRentable,
  cumpleBien,
  DEFAULT_CONFIG_SEGMENTACION,
  type InsumoSegmentacion,
} from "../lib/segmentacion";

const base: InsumoSegmentacion = {
  honorarioMensual: null,
  monedaHonorario: null,
  casosAbiertos: 0,
  casosProblematicos: 0,
};

test("dorado: alta rentabilidad + buen cumplimiento", () => {
  const r = calcularSegmento({
    ...base,
    honorarioMensual: 500,
    monedaHonorario: "USD",
    casosAbiertos: 10,
    casosProblematicos: 1,
  });
  assert.equal(r.categoria, "dorado");
  assert.equal(r.rentable, true);
  assert.equal(r.cumple, true);
});

test("azul: alta rentabilidad + mal cumplimiento (cuenta grande en riesgo)", () => {
  const r = calcularSegmento({
    ...base,
    honorarioMensual: 500,
    monedaHonorario: "USD",
    casosAbiertos: 10,
    casosProblematicos: 5,
  });
  assert.equal(r.categoria, "azul");
});

test("verde: baja rentabilidad + buen cumplimiento", () => {
  const r = calcularSegmento({
    ...base,
    honorarioMensual: 100,
    monedaHonorario: "USD",
    casosAbiertos: 10,
    casosProblematicos: 0,
  });
  assert.equal(r.categoria, "verde");
});

test("amarillo: baja rentabilidad + mal cumplimiento", () => {
  const r = calcularSegmento({
    ...base,
    honorarioMensual: 100,
    monedaHonorario: "USD",
    casosAbiertos: 10,
    casosProblematicos: 8,
  });
  assert.equal(r.categoria, "amarillo");
});

test("sin plan activo nunca es rentable, aunque tenga casos al día", () => {
  const r = calcularSegmento({ ...base, casosAbiertos: 5, casosProblematicos: 0 });
  assert.equal(r.rentable, false);
  assert.equal(r.categoria, "verde");
  assert.match(r.motivos[0], /Sin plan/);
});

test("sin casos abiertos se considera cumplimiento bueno (nada de qué estar atrasado)", () => {
  assert.equal(cumpleBien({ casosAbiertos: 0, casosProblematicos: 0 }), true);
});

test("el umbral de incumplimiento es una fracción sobre casos abiertos, no un conteo absoluto", () => {
  // 2/10 = 20% == umbral exacto (default 0.2) → sigue siendo "cumple bien" (<=)
  assert.equal(cumpleBien({ casosAbiertos: 10, casosProblematicos: 2 }), true);
  // 3/10 = 30% > 20% → deja de cumplir
  assert.equal(cumpleBien({ casosAbiertos: 10, casosProblematicos: 3 }), false);
});

test("el honorario en Bs se compara contra el umbral de Bs, no el de USD", () => {
  const config = { ...DEFAULT_CONFIG_SEGMENTACION, umbralRentabilidadUsd: 300, umbralRentabilidadBs: 15000 };
  // 400 Bs es rentable en USD (>=300) pero NO alcanza el umbral de Bs (15000)
  assert.equal(
    esRentable({ honorarioMensual: 400, monedaHonorario: "Bs" }, config),
    false,
    "400 no es rentable como Bs aunque sí lo sería como USD"
  );
  assert.equal(esRentable({ honorarioMensual: 20000, monedaHonorario: "Bs" }, config), true);
});

test("umbrales configurables cambian el resultado sin tocar código", () => {
  const configEstricta = { ...DEFAULT_CONFIG_SEGMENTACION, umbralRentabilidadUsd: 1000 };
  const r = calcularSegmento(
    { ...base, honorarioMensual: 500, monedaHonorario: "USD", casosAbiertos: 0, casosProblematicos: 0 },
    configEstricta
  );
  assert.equal(r.rentable, false, "500 ya no alcanza el umbral subido a 1000");
  assert.equal(r.categoria, "verde");
});
