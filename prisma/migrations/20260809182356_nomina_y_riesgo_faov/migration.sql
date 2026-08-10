-- nomina y riesgo faov
-- Generada con: npm run db:migracion

-- CreateTable
CREATE TABLE "Trabajador" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "fechaIngreso" TIMESTAMP(3),
    "fechaEgreso" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trabajador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclaracionNomina" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "baseDeclarada" DOUBLE PRECISION NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "riesgo" BOOLEAN NOT NULL DEFAULT false,
    "motivoRiesgo" TEXT,
    "notaRiesgo" TEXT,
    "aprobadaPorId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeclaracionNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalarioMinimo" (
    "id" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'Bs',
    "notas" TEXT,

    CONSTRAINT "SalarioMinimo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trabajador_companyId_cedula_key" ON "Trabajador"("companyId", "cedula");

-- CreateIndex
CREATE INDEX "DeclaracionNomina_estado_idx" ON "DeclaracionNomina"("estado");

-- CreateIndex
CREATE INDEX "DeclaracionNomina_periodo_idx" ON "DeclaracionNomina"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "DeclaracionNomina_trabajadorId_periodo_key" ON "DeclaracionNomina"("trabajadorId", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "SalarioMinimo_vigenteDesde_moneda_key" ON "SalarioMinimo"("vigenteDesde", "moneda");

-- AddForeignKey
ALTER TABLE "Trabajador" ADD CONSTRAINT "Trabajador_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclaracionNomina" ADD CONSTRAINT "DeclaracionNomina_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclaracionNomina" ADD CONSTRAINT "DeclaracionNomina_aprobadaPorId_fkey" FOREIGN KEY ("aprobadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclaracionNomina" ADD CONSTRAINT "DeclaracionNomina_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

