// Tests de la facturación (F6): emisión mensual idempotente, factura del
// servicio entregado, vencimiento por plazo y totales por moneda. Corre contra
// una COPIA de la base de datos. Ejecutar con:
//
//   cp prisma/dev.db /tmp/skynet-test.db
//   DATABASE_URL="file:/tmp/skynet-test.db" npx tsx tests/facturacion.test.ts
//
if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("⛔ Este test necesita DATABASE_URL apuntando a una copia de prueba (ver cabecera).");
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  facturaVencida,
  totalesPorEstado,
  porCobrar,
  esTipoFactura,
  esEstadoPago,
  DIAS_PARA_VENCER,
} from "../lib/facturacion";
import {
  facturarHonorariosDelPeriodo,
  facturarServicioEntregado,
  marcarFacturasVencidas,
} from "../lib/fiscal/facturacion";

// ── Vocabulario y totales (puro) ────────────────────────────────────────────

test("solo se aceptan los tipos y estados del catálogo", () => {
  assert.ok(esTipoFactura("honorario_fijo"));
  assert.ok(esTipoFactura("servicio_individual"));
  assert.equal(esTipoFactura("abono"), false);
  assert.ok(esEstadoPago("pagado"));
  assert.equal(esEstadoPago("cobrado"), false, "la etiqueta no es la clave");
});

test("una factura se vence a los 30 días de emitida, y solo si está pendiente", () => {
  const hoy = new Date("2026-09-01T12:00:00");
  const hace31 = new Date("2026-08-01T12:00:00");
  const hace10 = new Date("2026-08-22T12:00:00");
  assert.equal(DIAS_PARA_VENCER, 30);
  assert.ok(facturaVencida("pendiente", hace31, hoy));
  assert.equal(facturaVencida("pendiente", hace10, hoy), false);
  assert.equal(facturaVencida("pagado", hace31, hoy), false, "lo cobrado no vence");
  assert.equal(facturaVencida("vencido", hace31, hoy), false, "ya está marcada");
});

test("los totales se agrupan por estado y por moneda, sin mezclar", () => {
  const facturas = [
    { moneda: "USD", monto: 100, estadoPago: "pendiente" },
    { moneda: "Bs", monto: 500, estadoPago: "pendiente" },
    { moneda: "USD", monto: 50, estadoPago: "pagado" },
    { moneda: "USD", monto: 30, estadoPago: "vencido" },
  ];
  const t = totalesPorEstado(facturas);
  assert.deepEqual(t.pendiente, [
    { moneda: "Bs", total: 500 },
    { moneda: "USD", total: 100 },
  ]);
  assert.deepEqual(t.pagado, [{ moneda: "USD", total: 50 }]);

  // Por cobrar = pendiente + vencido; lo pagado ya no se persigue
  assert.deepEqual(porCobrar(facturas), [
    { moneda: "Bs", total: 500 },
    { moneda: "USD", total: 130 },
  ]);
});

// ── Escenario en base de datos ──────────────────────────────────────────────

type Escenario = { companyId: string; planId: string };

async function limpiar() {
  await prisma.facturacion.deleteMany();
  await prisma.servicioIndividual.deleteMany();
  await prisma.planObligacion.deleteMany();
  await prisma.planServicio.deleteMany();
}

async function montarEscenario(honorario = 300): Promise<Escenario> {
  await limpiar();
  const company = await prisma.company.create({
    data: { name: "Cliente de prueba F6", rif: "J-11223344-5", estadoCliente: "activo" },
  });
  const plan = await prisma.planServicio.create({
    data: { companyId: company.id, honorarioMensual: honorario, moneda: "USD", estado: "activo" },
  });
  return { companyId: company.id, planId: plan.id };
}

async function borrarEscenario(e: Escenario) {
  await limpiar();
  await prisma.company.deleteMany({ where: { id: e.companyId } });
}

const julio = new Date(2026, 6, 20, 12, 0, 0);

test("cada plan activo genera el honorario del mes", async () => {
  const e = await montarEscenario();
  const res = await facturarHonorariosDelPeriodo({ hoy: julio, companyId: e.companyId });

  assert.equal(res.emitidas, 1);
  const factura = await prisma.facturacion.findFirst({ where: { companyId: e.companyId } });
  assert.equal(factura?.tipo, "honorario_fijo");
  assert.equal(factura?.periodo, "2026-07");
  assert.equal(factura?.monto, 300);
  assert.equal(factura?.estadoPago, "pendiente");
  assert.equal(factura?.origenId, e.planId, "el origen es el plan");
  await borrarEscenario(e);
});

test("correr la facturación dos veces en el mismo mes no cobra dos veces", async () => {
  const e = await montarEscenario();
  await facturarHonorariosDelPeriodo({ hoy: julio, companyId: e.companyId });
  const segunda = await facturarHonorariosDelPeriodo({ hoy: julio, companyId: e.companyId });

  assert.equal(segunda.emitidas, 0);
  assert.equal(segunda.yaExistian, 1);
  assert.equal(await prisma.facturacion.count({ where: { companyId: e.companyId } }), 1);
  await borrarEscenario(e);
});

test("el mes siguiente sí emite su propio cobro", async () => {
  const e = await montarEscenario();
  await facturarHonorariosDelPeriodo({ hoy: julio, companyId: e.companyId });
  const agosto = await facturarHonorariosDelPeriodo({
    hoy: new Date(2026, 7, 3, 12, 0, 0),
    companyId: e.companyId,
  });

  assert.equal(agosto.emitidas, 1);
  const periodos = (
    await prisma.facturacion.findMany({ where: { companyId: e.companyId }, orderBy: { periodo: "asc" } })
  ).map((f) => f.periodo);
  assert.deepEqual(periodos, ["2026-07", "2026-08"]);
  await borrarEscenario(e);
});

test("un plan pausado o cancelado no factura", async () => {
  const e = await montarEscenario();
  for (const estado of ["pausado", "cancelado"]) {
    await prisma.planServicio.update({ where: { id: e.planId }, data: { estado } });
    const res = await facturarHonorariosDelPeriodo({ hoy: julio, companyId: e.companyId });
    assert.equal(res.emitidas, 0, `plan ${estado}`);
  }
  assert.equal(await prisma.facturacion.count({ where: { companyId: e.companyId } }), 0);
  await borrarEscenario(e);
});

test("un plan sin honorario no ensucia la bandeja con cobros de cero", async () => {
  const e = await montarEscenario(0);
  const res = await facturarHonorariosDelPeriodo({ hoy: julio, companyId: e.companyId });
  assert.equal(res.emitidas, 0);
  await borrarEscenario(e);
});

// ── Servicios individuales ──────────────────────────────────────────────────

test("el servicio entregado genera su factura; el que no está entregado, no", async () => {
  const e = await montarEscenario();
  const servicio = await prisma.servicioIndividual.create({
    data: {
      companyId: e.companyId,
      tipo: "Auditoría",
      descripcion: "Cierre 2025",
      montoCotizado: 1200,
      moneda: "USD",
      estado: "en_ejecucion",
    },
  });

  assert.equal(await facturarServicioEntregado(servicio.id, julio), null, "aún no se entrega");

  await prisma.servicioIndividual.update({ where: { id: servicio.id }, data: { estado: "entregado" } });
  const factura = await facturarServicioEntregado(servicio.id, julio);
  assert.ok(factura);

  const fila = await prisma.facturacion.findUnique({ where: { id: factura!.id } });
  assert.equal(fila?.tipo, "servicio_individual");
  assert.equal(fila?.monto, 1200);
  assert.equal(fila?.origenId, servicio.id);
  assert.match(fila?.concepto ?? "", /Auditoría · Cierre 2025/);
  await borrarEscenario(e);
});

test("el mismo servicio no se factura dos veces aunque su estado vaya y venga", async () => {
  const e = await montarEscenario();
  const servicio = await prisma.servicioIndividual.create({
    data: { companyId: e.companyId, tipo: "Trámite", montoCotizado: 500, estado: "entregado" },
  });

  assert.ok(await facturarServicioEntregado(servicio.id, julio));
  assert.equal(await facturarServicioEntregado(servicio.id, julio), null, "ya estaba facturado");
  assert.equal(
    await prisma.facturacion.count({ where: { companyId: e.companyId, tipo: "servicio_individual" } }),
    1
  );
  await borrarEscenario(e);
});

test("dos servicios distintos del mismo mes se facturan por separado", async () => {
  const e = await montarEscenario();
  const a = await prisma.servicioIndividual.create({
    data: { companyId: e.companyId, tipo: "Auditoría", montoCotizado: 800, estado: "entregado" },
  });
  const b = await prisma.servicioIndividual.create({
    data: { companyId: e.companyId, tipo: "Trámite", montoCotizado: 200, estado: "entregado" },
  });

  assert.ok(await facturarServicioEntregado(a.id, julio));
  assert.ok(await facturarServicioEntregado(b.id, julio), "el índice único no debe bloquearlo");
  assert.equal(
    await prisma.facturacion.count({ where: { companyId: e.companyId, tipo: "servicio_individual" } }),
    2
  );
  await borrarEscenario(e);
});

test("el honorario y un servicio del mismo mes conviven", async () => {
  const e = await montarEscenario();
  await facturarHonorariosDelPeriodo({ hoy: julio, companyId: e.companyId });
  const servicio = await prisma.servicioIndividual.create({
    data: { companyId: e.companyId, tipo: "Auditoría", montoCotizado: 800, estado: "entregado" },
  });
  await facturarServicioEntregado(servicio.id, julio);

  const facturas = await prisma.facturacion.findMany({ where: { companyId: e.companyId } });
  assert.equal(facturas.length, 2);
  assert.deepEqual(
    facturas.map((f) => f.tipo).sort(),
    ["honorario_fijo", "servicio_individual"]
  );
  await borrarEscenario(e);
});

// ── Vencimiento por plazo ───────────────────────────────────────────────────

test("el barrido marca vencidas las pendientes que pasaron el plazo", async () => {
  const e = await montarEscenario();
  await facturarHonorariosDelPeriodo({ hoy: julio, companyId: e.companyId });
  const factura = await prisma.facturacion.findFirst({ where: { companyId: e.companyId } });

  // Emitida hace 40 días
  await prisma.facturacion.update({
    where: { id: factura!.id },
    data: { fechaEmision: new Date(Date.now() - 40 * 86_400_000) },
  });

  assert.equal(await marcarFacturasVencidas(), 1);
  assert.equal(
    (await prisma.facturacion.findUnique({ where: { id: factura!.id } }))?.estadoPago,
    "vencido"
  );
  // Segunda pasada: ya está marcada
  assert.equal(await marcarFacturasVencidas(), 0);
  await borrarEscenario(e);
});

test("una factura cobrada no se vence por más que pase el tiempo", async () => {
  const e = await montarEscenario();
  await facturarHonorariosDelPeriodo({ hoy: julio, companyId: e.companyId });
  const factura = await prisma.facturacion.findFirst({ where: { companyId: e.companyId } });
  await prisma.facturacion.update({
    where: { id: factura!.id },
    data: {
      estadoPago: "pagado",
      fechaPago: new Date(),
      fechaEmision: new Date(Date.now() - 90 * 86_400_000),
    },
  });

  assert.equal(await marcarFacturasVencidas(), 0);
  await borrarEscenario(e);
});
