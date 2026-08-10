-- configuracion de nomina 2.3: pais y monedas, horarios y jornadas
-- Generada con: npm run db:migracion

-- CreateTable
CREATE TABLE "ConfiguracionNomina" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pais" TEXT NOT NULL DEFAULT 'Venezuela',
    "frecuenciaPago" TEXT NOT NULL DEFAULT 'quincenal',
    "monedaSalario" TEXT NOT NULL DEFAULT 'USD',
    "monedaBonos" TEXT NOT NULL DEFAULT 'USD',
    "monedaDeducciones" TEXT NOT NULL DEFAULT 'USD',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jornada" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "horaEntrada" TEXT NOT NULL,
    "horaSalida" TEXT NOT NULL,
    "descansoMinutos" INTEGER NOT NULL DEFAULT 0,
    "metodo" TEXT NOT NULL DEFAULT 'fija',
    "toleranciaMinutos" INTEGER,
    "umbralMedioDiaHoras" DOUBLE PRECISION,
    "nocturna" BOOLEAN NOT NULL DEFAULT false,
    "diasOperacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jornada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionNomina_companyId_key" ON "ConfiguracionNomina"("companyId");

-- CreateIndex
CREATE INDEX "Jornada_companyId_idx" ON "Jornada"("companyId");

-- AddForeignKey
ALTER TABLE "ConfiguracionNomina" ADD CONSTRAINT "ConfiguracionNomina_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jornada" ADD CONSTRAINT "Jornada_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

