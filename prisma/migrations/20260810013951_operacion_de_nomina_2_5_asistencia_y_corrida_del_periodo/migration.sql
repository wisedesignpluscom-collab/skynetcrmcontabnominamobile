-- operacion de nomina 2.5: asistencia y corrida del periodo
-- Generada con: npm run db:migracion

-- CreateTable
CREATE TABLE "AsistenciaDia" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "horas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsistenciaDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorridaNomina" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "totalBruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeducciones" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalNeto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "auditoriaAlerta" BOOLEAN NOT NULL DEFAULT false,
    "auditoriaDetalle" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorridaNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorridaDetalle" (
    "id" TEXT NOT NULL,
    "corridaId" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "horasTrabajadas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseDevengada" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalConceptos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeducciones" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "neto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorridaDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorridaLinea" (
    "id" TEXT NOT NULL,
    "detalleId" TEXT NOT NULL,
    "conceptoId" TEXT NOT NULL,
    "horasParam" DOUBLE PRECISION,
    "diasParam" DOUBLE PRECISION,
    "monto" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorridaLinea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaDia_trabajadorId_fecha_key" ON "AsistenciaDia"("trabajadorId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "CorridaNomina_companyId_periodo_key" ON "CorridaNomina"("companyId", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "CorridaDetalle_corridaId_trabajadorId_key" ON "CorridaDetalle"("corridaId", "trabajadorId");

-- AddForeignKey
ALTER TABLE "AsistenciaDia" ADD CONSTRAINT "AsistenciaDia_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaNomina" ADD CONSTRAINT "CorridaNomina_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaNomina" ADD CONSTRAINT "CorridaNomina_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaDetalle" ADD CONSTRAINT "CorridaDetalle_corridaId_fkey" FOREIGN KEY ("corridaId") REFERENCES "CorridaNomina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaDetalle" ADD CONSTRAINT "CorridaDetalle_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaLinea" ADD CONSTRAINT "CorridaLinea_detalleId_fkey" FOREIGN KEY ("detalleId") REFERENCES "CorridaDetalle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaLinea" ADD CONSTRAINT "CorridaLinea_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "ConceptoNomina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

