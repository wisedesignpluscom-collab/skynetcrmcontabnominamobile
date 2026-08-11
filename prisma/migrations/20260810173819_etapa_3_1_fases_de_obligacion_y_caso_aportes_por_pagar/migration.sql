-- etapa 3.1 fases de obligacion y caso, aportes por pagar
-- Generada con: npm run db:migracion

-- AlterTable
ALTER TABLE "AporteLegal" ADD COLUMN     "cuentaContable" TEXT,
ADD COLUMN     "ente" TEXT;

-- CreateTable
CREATE TABLE "ObligacionFase" (
    "id" TEXT NOT NULL,
    "obligacionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "ayuda" TEXT,
    "campos" TEXT NOT NULL DEFAULT '[]',
    "validacionEspecial" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObligacionFase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasoFase" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "obligacionFaseId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "datos" TEXT,
    "completadaPorId" TEXT,
    "completadaAt" TIMESTAMP(3),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CasoFase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AportePorPagar" (
    "id" TEXT NOT NULL,
    "corridaId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ente" TEXT NOT NULL,
    "montoTrabajador" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montoPatronal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montoTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "cuentaContable" TEXT,
    "estadoPago" TEXT NOT NULL DEFAULT 'pendiente',
    "fechaGeneracion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaPago" TIMESTAMP(3),
    "notas" TEXT,

    CONSTRAINT "AportePorPagar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObligacionFase_obligacionId_idx" ON "ObligacionFase"("obligacionId");

-- CreateIndex
CREATE INDEX "CasoFase_casoId_idx" ON "CasoFase"("casoId");

-- CreateIndex
CREATE UNIQUE INDEX "CasoFase_casoId_obligacionFaseId_key" ON "CasoFase"("casoId", "obligacionFaseId");

-- CreateIndex
CREATE INDEX "AportePorPagar_companyId_idx" ON "AportePorPagar"("companyId");

-- CreateIndex
CREATE INDEX "AportePorPagar_estadoPago_idx" ON "AportePorPagar"("estadoPago");

-- CreateIndex
CREATE UNIQUE INDEX "AportePorPagar_corridaId_ente_key" ON "AportePorPagar"("corridaId", "ente");

-- AddForeignKey
ALTER TABLE "ObligacionFase" ADD CONSTRAINT "ObligacionFase_obligacionId_fkey" FOREIGN KEY ("obligacionId") REFERENCES "Obligacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoFase" ADD CONSTRAINT "CasoFase_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "CasoRecurrente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoFase" ADD CONSTRAINT "CasoFase_obligacionFaseId_fkey" FOREIGN KEY ("obligacionFaseId") REFERENCES "ObligacionFase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoFase" ADD CONSTRAINT "CasoFase_completadaPorId_fkey" FOREIGN KEY ("completadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AportePorPagar" ADD CONSTRAINT "AportePorPagar_corridaId_fkey" FOREIGN KEY ("corridaId") REFERENCES "CorridaNomina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AportePorPagar" ADD CONSTRAINT "AportePorPagar_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

