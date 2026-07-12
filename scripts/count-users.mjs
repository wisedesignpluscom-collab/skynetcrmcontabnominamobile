// Imprime cuántos usuarios hay en la base (lo usa docker-entrypoint.sh para
// decidir si sembrar). Si la base aún no responde, termina con error (código ≠ 0)
// para que el entrypoint siga esperando.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const n = await prisma.user.count();
  console.log(n);
  await prisma.$disconnect();
  process.exit(0);
} catch {
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
}
