// Seed de demostración del portal de clientes (Fase 1). Solo toca la tabla
// PortalUser — no modifica clientes, planes, casos ni ningún otro dato del CRM.
// Idempotente: se puede correr varias veces sin duplicar nada.
//
//   npx tsx prisma/seed-portal.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL_DEMO = "cliente.demo@portal.local";
const PASSWORD_DEMO = "PortalDemo123";

async function main() {
  const company = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (!company) {
    console.log("No hay ninguna empresa en la base — corre antes el seed del CRM.");
    return;
  }

  await prisma.portalUser.upsert({
    where: { email: EMAIL_DEMO },
    update: { companyId: company.id },
    create: {
      companyId: company.id,
      name: "Contacto de prueba",
      email: EMAIL_DEMO,
      passwordHash: await bcrypt.hash(PASSWORD_DEMO, 10),
      active: true,
      mustChangePassword: false,
    },
  });

  console.log(
    `Portal de clientes — acceso de prueba listo:\n` +
      `  Empresa: ${company.name}\n` +
      `  Email:   ${EMAIL_DEMO}\n` +
      `  Clave:   ${PASSWORD_DEMO}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
