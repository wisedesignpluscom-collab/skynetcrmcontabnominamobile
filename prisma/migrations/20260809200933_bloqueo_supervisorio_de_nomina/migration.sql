-- bloqueo supervisorio de nomina
-- Generada con: npm run db:migracion

-- AlterTable
ALTER TABLE "DeclaracionNomina" ADD COLUMN     "resueltoPorId" TEXT;

-- AddForeignKey
ALTER TABLE "DeclaracionNomina" ADD CONSTRAINT "DeclaracionNomina_resueltoPorId_fkey" FOREIGN KEY ("resueltoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

