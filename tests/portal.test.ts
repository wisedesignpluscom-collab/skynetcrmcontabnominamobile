// Tests del portal de clientes (Fase 1): login con bloqueo persistente,
// re-verificación en vivo de active/mustChangePassword, aislamiento de scope
// entre empresas, y el permiso de gestión de accesos. Corre contra una COPIA
// de la base de datos (nunca contra los datos demo):
//
//   cp prisma/dev.db /tmp/skynet-test.db
//   DATABASE_URL="file:/tmp/skynet-test.db" npx tsx tests/portal.test.ts
//
if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("⛔ Este test necesita DATABASE_URL apuntando a una copia de prueba (ver cabecera).");
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import {
  attemptPortalLogin,
  resolvePortalAuth,
  portalCompanyScope,
  MAX_INTENTOS_FALLIDOS,
} from "../lib/portal";
import { canManagePortalAccess } from "../lib/permissions";

const PASSWORD = "ClaveDePrueba123";

async function crearEmpresaConPortal(nombre: string, overrides: Partial<{
  active: boolean;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
}> = {}) {
  const company = await prisma.company.create({ data: { name: nombre } });
  const portalUser = await prisma.portalUser.create({
    data: {
      companyId: company.id,
      name: `Contacto de ${nombre}`,
      email: `${company.id}@portal-test.local`,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      active: overrides.active ?? true,
      mustChangePassword: overrides.mustChangePassword ?? false,
      failedAttempts: overrides.failedAttempts ?? 0,
      lockedUntil: overrides.lockedUntil ?? null,
    },
  });
  return { company, portalUser };
}

async function limpiar(companyIds: string[]) {
  await prisma.mensajeChat.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.casoRecurrente.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.portalUser.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

test("login correcto: resetea intentos y marca lastLoginAt", async () => {
  const { company, portalUser } = await crearEmpresaConPortal("Login OK");
  try {
    const r = await attemptPortalLogin(portalUser.email, PASSWORD);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.user.companyId, company.id);
      assert.equal(r.user.mustChangePassword, false);
    }
    const fresh = await prisma.portalUser.findUnique({ where: { id: portalUser.id } });
    assert.equal(fresh?.failedAttempts, 0);
    assert.ok(fresh?.lastLoginAt);
  } finally {
    await limpiar([company.id]);
  }
});

test("login con clave incorrecta: no entra y suma un intento fallido", async () => {
  const { company, portalUser } = await crearEmpresaConPortal("Login mal");
  try {
    const r = await attemptPortalLogin(portalUser.email, "clave-equivocada");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "Email o contraseña incorrectos.");
    const fresh = await prisma.portalUser.findUnique({ where: { id: portalUser.id } });
    assert.equal(fresh?.failedAttempts, 1);
  } finally {
    await limpiar([company.id]);
  }
});

test("email inexistente: mismo mensaje genérico, no revienta ni crea registros", async () => {
  const r = await attemptPortalLogin("no-existe@portal-test.local", "cualquiera");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "Email o contraseña incorrectos.");
});

test(`bloqueo persistente tras ${MAX_INTENTOS_FALLIDOS} intentos fallidos`, async () => {
  const { company, portalUser } = await crearEmpresaConPortal("Bloqueo");
  try {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) {
      await attemptPortalLogin(portalUser.email, "clave-equivocada");
    }
    const bloqueado = await prisma.portalUser.findUnique({ where: { id: portalUser.id } });
    assert.equal(bloqueado?.failedAttempts, MAX_INTENTOS_FALLIDOS);
    assert.ok(bloqueado?.lockedUntil && bloqueado.lockedUntil > new Date());

    // Aunque ahora escriba la clave correcta, el bloqueo lo detiene
    const r = await attemptPortalLogin(portalUser.email, PASSWORD);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /bloqueado/i);
  } finally {
    await limpiar([company.id]);
  }
});

test("el bloqueo expira: pasado lockedUntil, la clave correcta vuelve a entrar", async () => {
  const { company, portalUser } = await crearEmpresaConPortal("Bloqueo vencido", {
    failedAttempts: MAX_INTENTOS_FALLIDOS,
    lockedUntil: new Date(Date.now() - 1000), // ya pasó
  });
  try {
    const r = await attemptPortalLogin(portalUser.email, PASSWORD);
    assert.equal(r.ok, true);
  } finally {
    await limpiar([company.id]);
  }
});

test("cuenta desactivada: la clave correcta no entra", async () => {
  const { company, portalUser } = await crearEmpresaConPortal("Desactivada", { active: false });
  try {
    const r = await attemptPortalLogin(portalUser.email, PASSWORD);
    assert.equal(r.ok, false);
  } finally {
    await limpiar([company.id]);
  }
});

test("resolvePortalAuth: sesión nula → anon", async () => {
  const estado = await resolvePortalAuth(null);
  assert.equal(estado.status, "anon");
});

test("resolvePortalAuth: reactiva/desactiva de inmediato aunque el JWT siga vigente", async () => {
  const { company, portalUser } = await crearEmpresaConPortal("Re-verificación");
  try {
    const sesion = { id: portalUser.id, companyId: company.id, name: portalUser.name, email: portalUser.email };

    const antes = await resolvePortalAuth(sesion);
    assert.equal(antes.status, "ok");

    // El gestor desactiva el acceso desde la ficha del cliente — sin tocar el
    // token, que en teoría seguiría siendo válido hasta por 1 día.
    await prisma.portalUser.update({ where: { id: portalUser.id }, data: { active: false } });
    const despues = await resolvePortalAuth(sesion);
    assert.equal(despues.status, "blocked");
  } finally {
    await limpiar([company.id]);
  }
});

test("resolvePortalAuth: mustChangePassword fuerza el estado correspondiente con el nombre de empresa", async () => {
  const { company, portalUser } = await crearEmpresaConPortal("Cambio de clave", { mustChangePassword: true });
  try {
    const sesion = { id: portalUser.id, companyId: company.id, name: portalUser.name, email: portalUser.email };
    const estado = await resolvePortalAuth(sesion);
    assert.equal(estado.status, "must_change_password");
    if (estado.status === "must_change_password") assert.equal(estado.companyName, company.name);
  } finally {
    await limpiar([company.id]);
  }
});

test("portalCompanyScope aísla los datos: la empresa A no ve casos de la empresa B", async () => {
  const { company: companyA } = await crearEmpresaConPortal("Aislada A");
  const { company: companyB } = await crearEmpresaConPortal("Aislada B");
  try {
    const obligacion = await prisma.obligacion.findFirst();
    assert.ok(obligacion, "el seed de obligaciones debe existir para esta prueba");

    await prisma.casoRecurrente.create({
      data: { companyId: companyA.id, obligacionId: obligacion!.id, periodoFiscal: "2099-01" },
    });
    await prisma.casoRecurrente.create({
      data: { companyId: companyB.id, obligacionId: obligacion!.id, periodoFiscal: "2099-01" },
    });

    const sesionA = { id: "x", companyId: companyA.id, name: "x", email: "x" };
    const casosDeA = await prisma.casoRecurrente.findMany({ where: portalCompanyScope(sesionA) });

    assert.equal(casosDeA.length, 1);
    assert.equal(casosDeA[0].companyId, companyA.id);
  } finally {
    await limpiar([companyA.id, companyB.id]);
  }
});

test("canManagePortalAccess: admin y supervisor sí, analista (vendedor) no", () => {
  assert.equal(canManagePortalAccess("admin"), true);
  assert.equal(canManagePortalAccess("supervisor"), true);
  assert.equal(canManagePortalAccess("vendedor"), false);
  assert.equal(canManagePortalAccess(undefined), false);
});
