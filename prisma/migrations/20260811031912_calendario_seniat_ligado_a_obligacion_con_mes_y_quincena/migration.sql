-- calendario seniat ligado a obligacion con mes y quincena
-- Generada con: npm run db:migracion
--
-- ATENCIÓN si el servidor ya tiene filas cargadas en CalendarioSeniat: el
-- rediseño no puede inferir a qué obligación pertenecía cada fila vieja (el
-- modelo anterior solo sabía "mensual"/"quincenal", no la obligación). Antes
-- de aplicar esta migración en un servidor con datos, correr:
--   DELETE FROM "CalendarioSeniat";
-- y volver a cargar el calendario del año desde /configuracion (es un dato
-- público que se recarga cada año de todas formas, nunca se pierde info del
-- cliente).

-- DropIndex
DROP INDEX "CalendarioSeniat_anio_periodicidad_digito_key";

-- AlterTable
ALTER TABLE "CalendarioSeniat" DROP COLUMN "periodicidad",
ADD COLUMN     "mes" INTEGER NOT NULL,
ADD COLUMN     "obligacionId" TEXT NOT NULL,
ADD COLUMN     "quincena" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "CalendarioSeniat_anio_obligacionId_idx" ON "CalendarioSeniat"("anio", "obligacionId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarioSeniat_anio_obligacionId_mes_quincena_digito_key" ON "CalendarioSeniat"("anio", "obligacionId", "mes", "quincena", "digito");

-- AddForeignKey
ALTER TABLE "CalendarioSeniat" ADD CONSTRAINT "CalendarioSeniat_obligacionId_fkey" FOREIGN KEY ("obligacionId") REFERENCES "Obligacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

