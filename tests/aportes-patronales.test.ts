// Aportes de ley por ente (Etapa 3.7 «Mis Consultores»): suma trabajador +
// patronal por ente, con el tope de 5 salarios mínimos solo para IVSS.
// Módulo puro — sin BD.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularAportesPeriodo, type AporteLegalCalc, type BaseAporteTrabajador } from "../lib/aportesPatronales";

const APORTES: AporteLegalCalc[] = [
  { ente: "IVSS", tipo: "trabajador", porcentaje: 4, cuentaContable: "2110" },
  { ente: "IVSS", tipo: "patronal", porcentaje: 10, cuentaContable: "2110" },
  { ente: "BANAVIH", tipo: "trabajador", porcentaje: 1, cuentaContable: null },
  { ente: "BANAVIH", tipo: "patronal", porcentaje: 2, cuentaContable: "2120" },
  { ente: "SENIAT", tipo: "patronal", porcentaje: 9, cuentaContable: null },
  // Sin ente asignado: debe ignorarse por completo (RPE hoy, según el catálogo estándar)
  { ente: null, tipo: "trabajador", porcentaje: 0.5, cuentaContable: null },
];

test("suma trabajador + patronal por ente, ignorando aportes sin ente", () => {
  const bases: BaseAporteTrabajador[] = [{ baseParaAporte: 1000 }];
  const totales = calcularAportesPeriodo(bases, APORTES, null);
  assert.equal(totales.length, 3, "IVSS, BANAVIH, SENIAT — no el sin-ente");

  const ivss = totales.find((t) => t.ente === "IVSS")!;
  assert.equal(ivss.montoTrabajador, 40);
  assert.equal(ivss.montoPatronal, 100);
  assert.equal(ivss.montoTotal, 140);
  assert.equal(ivss.cuentaContable, "2110");

  const banavih = totales.find((t) => t.ente === "BANAVIH")!;
  assert.equal(banavih.montoTrabajador, 10);
  assert.equal(banavih.montoPatronal, 20);
  assert.equal(banavih.cuentaContable, "2120", "toma la cuenta del primer AporteLegal del ente que la tenga");

  const seniat = totales.find((t) => t.ente === "SENIAT")!;
  assert.equal(seniat.montoTrabajador, 0, "Pensiones: sin pata de trabajador");
  assert.equal(seniat.montoPatronal, 90);
});

test("suma varios trabajadores del período", () => {
  const bases: BaseAporteTrabajador[] = [{ baseParaAporte: 1000 }, { baseParaAporte: 500 }];
  const totales = calcularAportesPeriodo(bases, APORTES, null);
  const ivss = totales.find((t) => t.ente === "IVSS")!;
  assert.equal(ivss.montoTrabajador, 40 + 20);
  assert.equal(ivss.montoPatronal, 100 + 50);
});

test("IVSS topa la base a 5 salarios mínimos; el resto de los entes no tiene tope", () => {
  // Salario mínimo 130 → tope IVSS = 650. Una base de 2000 se recorta a 650.
  const bases: BaseAporteTrabajador[] = [{ baseParaAporte: 2000 }];
  const totales = calcularAportesPeriodo(bases, APORTES, 130);

  const ivss = totales.find((t) => t.ente === "IVSS")!;
  assert.equal(ivss.montoTrabajador, 650 * 0.04);
  assert.equal(ivss.montoPatronal, 650 * 0.1);

  const banavih = totales.find((t) => t.ente === "BANAVIH")!;
  assert.equal(banavih.montoTrabajador, 2000 * 0.01, "FAOV sin tope, sobre la base completa");

  const seniat = totales.find((t) => t.ente === "SENIAT")!;
  assert.equal(seniat.montoPatronal, 2000 * 0.09, "Pensiones sin tope");
});

test("sin salario mínimo cargado, IVSS tampoco topa (nunca se inventa un tope)", () => {
  const bases: BaseAporteTrabajador[] = [{ baseParaAporte: 5000 }];
  const totales = calcularAportesPeriodo(bases, APORTES, null);
  const ivss = totales.find((t) => t.ente === "IVSS")!;
  assert.equal(ivss.montoTrabajador, 5000 * 0.04);
});

test("sin aportes con ente, no genera ningún total", () => {
  const bases: BaseAporteTrabajador[] = [{ baseParaAporte: 1000 }];
  const totales = calcularAportesPeriodo(bases, [{ ente: null, tipo: "trabajador", porcentaje: 4, cuentaContable: null }], null);
  assert.deepEqual(totales, []);
});
