// Tests del chat interno cliente ↔ gestor (Fase 2 del portal): creación de
// mensajes, marcas de leído por cada lado y aislamiento entre empresas. Corre
// contra una COPIA de la base de datos (nunca contra los datos demo):
//
//   cp prisma/dev.db /tmp/skynet-test.db
//   DATABASE_URL="file:/tmp/skynet-test.db" npx tsx tests/chat.test.ts
//
if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("⛔ Este test necesita DATABASE_URL apuntando a una copia de prueba (ver cabecera).");
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  crearMensaje,
  marcarLeidoPorStaff,
  marcarLeidoPorCliente,
  contarNoLeidosPorCliente,
  noLeidosPorStaffWhere,
  MAX_MENSAJE_LENGTH,
} from "../lib/chat";

async function crearEmpresa(nombre: string) {
  return prisma.company.create({ data: { name: nombre } });
}

async function limpiar(companyIds: string[]) {
  await prisma.mensajeChat.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

test("crearMensaje del cliente nace leído por él y sin leer por el staff", async () => {
  const company = await crearEmpresa("Chat A");
  try {
    const m = await crearMensaje({ companyId: company.id, contenido: "Hola, ¿cómo va mi declaración?", autorTipo: "cliente" });
    assert.ok(m);
    assert.ok(m!.readByClientAt);
    assert.equal(m!.readByStaffAt, null);
  } finally {
    await limpiar([company.id]);
  }
});

test("crearMensaje del staff nace leído por él y sin leer por el cliente", async () => {
  const company = await crearEmpresa("Chat B");
  try {
    const m = await crearMensaje({ companyId: company.id, contenido: "Ya la estamos revisando.", autorTipo: "staff" });
    assert.ok(m);
    assert.ok(m!.readByStaffAt);
    assert.equal(m!.readByClientAt, null);
  } finally {
    await limpiar([company.id]);
  }
});

test("mensaje vacío o solo espacios no crea nada", async () => {
  const company = await crearEmpresa("Chat vacío");
  try {
    const m = await crearMensaje({ companyId: company.id, contenido: "   ", autorTipo: "cliente" });
    assert.equal(m, null);
    const total = await prisma.mensajeChat.count({ where: { companyId: company.id } });
    assert.equal(total, 0);
  } finally {
    await limpiar([company.id]);
  }
});

test("el contenido se recorta a MAX_MENSAJE_LENGTH", async () => {
  const company = await crearEmpresa("Chat largo");
  try {
    const largo = "x".repeat(MAX_MENSAJE_LENGTH + 500);
    const m = await crearMensaje({ companyId: company.id, contenido: largo, autorTipo: "cliente" });
    assert.equal(m!.contenido.length, MAX_MENSAJE_LENGTH);
  } finally {
    await limpiar([company.id]);
  }
});

test("marcarLeidoPorStaff solo toca los mensajes del cliente de ESA empresa", async () => {
  const companyA = await crearEmpresa("Chat leído A");
  const companyB = await crearEmpresa("Chat leído B");
  try {
    await crearMensaje({ companyId: companyA.id, contenido: "mensaje A del cliente", autorTipo: "cliente" });
    await crearMensaje({ companyId: companyA.id, contenido: "mensaje A del staff", autorTipo: "staff" });
    await crearMensaje({ companyId: companyB.id, contenido: "mensaje B del cliente", autorTipo: "cliente" });

    await marcarLeidoPorStaff(companyA.id);

    const [aCliente, aStaff, bCliente] = await Promise.all([
      prisma.mensajeChat.findFirst({ where: { companyId: companyA.id, autorTipo: "cliente" } }),
      prisma.mensajeChat.findFirst({ where: { companyId: companyA.id, autorTipo: "staff" } }),
      prisma.mensajeChat.findFirst({ where: { companyId: companyB.id, autorTipo: "cliente" } }),
    ]);

    assert.ok(aCliente!.readByStaffAt, "el mensaje del cliente en A queda leído por staff");
    assert.ok(aStaff!.readByStaffAt, "el propio mensaje del staff ya estaba leído por staff (no cambia)");
    assert.equal(bCliente!.readByStaffAt, null, "la empresa B no se ve afectada");
  } finally {
    await limpiar([companyA.id, companyB.id]);
  }
});

test("marcarLeidoPorCliente solo toca los mensajes del staff, y contarNoLeidosPorCliente baja a 0", async () => {
  const company = await crearEmpresa("Chat cliente lee");
  try {
    await crearMensaje({ companyId: company.id, contenido: "aviso 1", autorTipo: "staff" });
    await crearMensaje({ companyId: company.id, contenido: "aviso 2", autorTipo: "staff" });
    assert.equal(await contarNoLeidosPorCliente(company.id), 2);

    await marcarLeidoPorCliente(company.id);
    assert.equal(await contarNoLeidosPorCliente(company.id), 0);
  } finally {
    await limpiar([company.id]);
  }
});

test("noLeidosPorStaffWhere respeta el scope de empresa (cartera del analista)", async () => {
  const companyA = await crearEmpresa("Cartera analista");
  const companyB = await crearEmpresa("Fuera de cartera");
  try {
    await crearMensaje({ companyId: companyA.id, contenido: "de A", autorTipo: "cliente" });
    await crearMensaje({ companyId: companyB.id, contenido: "de B", autorTipo: "cliente" });

    // Simula companyScope(session) de un analista cuya cartera es solo A
    const scope = { id: { in: [companyA.id] } };
    const noLeidos = await prisma.mensajeChat.findMany({ where: noLeidosPorStaffWhere(scope) });

    assert.equal(noLeidos.length, 1);
    assert.equal(noLeidos[0].companyId, companyA.id);
  } finally {
    await limpiar([companyA.id, companyB.id]);
  }
});
