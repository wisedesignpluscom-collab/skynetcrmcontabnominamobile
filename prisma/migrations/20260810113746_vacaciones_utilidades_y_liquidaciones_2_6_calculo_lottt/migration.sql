-- vacaciones utilidades y liquidaciones 2.6: calculo LOTTT
-- Generada con: npm run db:migracion

-- CreateTable
CREATE TABLE "RegistroVacaciones" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "anioServicio" INTEGER NOT NULL,
    "fechaCorte" TIMESTAMP(3) NOT NULL,
    "diasCorrespondientes" DOUBLE PRECISION NOT NULL,
    "diasTomados" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistroVacaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroUtilidades" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "diasCalculados" DOUBLE PRECISION NOT NULL,
    "montoCalculado" DOUBLE PRECISION NOT NULL,
    "montoPagado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "fechaPago" TIMESTAMP(3),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistroUtilidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liquidacion" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "fechaEgreso" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "aniosServicio" DOUBLE PRECISION NOT NULL,
    "salarioIntegralDiario" DOUBLE PRECISION NOT NULL,
    "montoPrestaciones" DOUBLE PRECISION NOT NULL,
    "diasVacacionesPendientes" DOUBLE PRECISION NOT NULL,
    "montoVacacionesPendientes" DOUBLE PRECISION NOT NULL,
    "montoUtilidadesFraccionadas" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "fechaPago" TIMESTAMP(3),
    "notas" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistroVacaciones_trabajadorId_anioServicio_key" ON "RegistroVacaciones"("trabajadorId", "anioServicio");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroUtilidades_trabajadorId_anio_key" ON "RegistroUtilidades"("trabajadorId", "anio");

-- AddForeignKey
ALTER TABLE "RegistroVacaciones" ADD CONSTRAINT "RegistroVacaciones_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroUtilidades" ADD CONSTRAINT "RegistroUtilidades_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

