-- corrida 2.5: base mensual de referencia para formulas de conceptos
-- Generada con: npm run db:migracion

-- AlterTable
ALTER TABLE "CorridaDetalle" ADD COLUMN     "baseMensualReferencia" DOUBLE PRECISION NOT NULL DEFAULT 0;

