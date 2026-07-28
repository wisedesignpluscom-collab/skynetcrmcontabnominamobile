// Usuarios iniciales para un ambiente nuevo (ej. el despliegue en la nube).
// El seed.ts de datos demo asume que YA existe un admin (lo usa como dueño de la
// cartera), así que esto debe correr ANTES. Es idempotente (upsert): correrlo de
// nuevo no duplica usuarios.
//
// El admin se puede personalizar con variables de entorno:
//   ADMIN_EMAIL / ADMIN_PASSWORD
// Los dos usuarios de prueba (supervisor y vendedor) sirven para probar permisos.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// En una instalación real NO se crean los usuarios de prueba: quedarían como
// puerta abierta con una clave conocida. El instalador de Windows fija
// SIN_USUARIOS_PRUEBA=1 y pasa el correo y la clave del gerente.
const soloGerente = process.env.SIN_USUARIOS_PRUEBA === "1";

const gerente = {
  name: process.env.ADMIN_NAME ?? "Administrador",
  email: process.env.ADMIN_EMAIL ?? "admin@skynetcrm.com",
  password: process.env.ADMIN_PASSWORD ?? "admin123",
  role: "admin",
};

if (!soloGerente && gerente.password === "admin123") {
  console.warn(
    "⚠ Se está usando la clave por defecto «admin123». Solo para desarrollo:\n" +
      "  en producción, define ADMIN_PASSWORD antes de sembrar."
  );
}

const users = soloGerente
  ? [gerente]
  : [
      gerente,
      { name: "Supervisor de prueba", email: "supervisor@test.com", password: "prueba123", role: "supervisor" },
      { name: "Analista de prueba", email: "vendedor@test.com", password: "prueba123", role: "vendedor" },
    ];

async function main() {
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role }, // no pisa la contraseña si ya existe
      create: { name: u.name, email: u.email, passwordHash, role: u.role },
    });
    console.log(`  ✓ ${u.role.padEnd(10)} ${u.email}`);
  }
  console.log("Usuarios listos. ⚠️  Cambia las contraseñas por defecto antes de usarlo en serio.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
