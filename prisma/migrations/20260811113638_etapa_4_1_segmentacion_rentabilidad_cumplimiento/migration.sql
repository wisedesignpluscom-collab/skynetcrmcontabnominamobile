-- etapa_4_1_segmentacion_rentabilidad_cumplimiento
-- Generada con: npm run db:migracion

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "segmentoCategoria" TEXT,
ADD COLUMN     "segmentoComputadoAt" TIMESTAMP(3),
ADD COLUMN     "segmentoMotivos" TEXT;

