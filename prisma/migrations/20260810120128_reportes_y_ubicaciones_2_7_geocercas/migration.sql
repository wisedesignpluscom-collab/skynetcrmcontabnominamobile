-- reportes y ubicaciones 2.7: geocercas
-- Generada con: npm run db:migracion

-- CreateTable
CREATE TABLE "Geocerca" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "radioMetros" INTEGER NOT NULL DEFAULT 100,
    "jornadaId" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Geocerca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Geocerca_companyId_idx" ON "Geocerca"("companyId");

-- AddForeignKey
ALTER TABLE "Geocerca" ADD CONSTRAINT "Geocerca_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geocerca" ADD CONSTRAINT "Geocerca_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "Jornada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

