-- auditoria de la marca de riesgo manual
-- Generada con: npm run db:migracion

-- AlterTable
ALTER TABLE "DeclaracionNomina" ADD COLUMN     "riesgoMarcadoPorId" TEXT;

-- AddForeignKey
ALTER TABLE "DeclaracionNomina" ADD CONSTRAINT "DeclaracionNomina_riesgoMarcadoPorId_fkey" FOREIGN KEY ("riesgoMarcadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

