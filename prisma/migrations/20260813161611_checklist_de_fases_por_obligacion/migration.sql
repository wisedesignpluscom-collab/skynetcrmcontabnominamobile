-- checklist de fases por obligacion
-- Generada con: npm run db:migracion

-- DropIndex
DROP INDEX "CalendarioSeniat_anio_periodicidad_digito_key";

-- AlterTable
ALTER TABLE "Obligacion" ADD COLUMN     "calendarioTipo" TEXT;

-- AlterTable
ALTER TABLE "CalendarioSeniat" ADD COLUMN     "mes" INTEGER NOT NULL,
ADD COLUMN     "quincena" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'iva_retenciones';

-- CreateTable
CREATE TABLE "FaseObligacion" (
    "id" TEXT NOT NULL,
    "obligacionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "campos" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaseObligacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasoFaseProgreso" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "faseObligacionId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedById" TEXT,
    "valores" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "CasoFaseProgreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalUser" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajeChat" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "autorTipo" TEXT NOT NULL,
    "userId" TEXT,
    "portalUserId" TEXT,
    "readByStaffAt" TIMESTAMP(3),
    "readByClientAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivoNombre" TEXT,
    "archivoRuta" TEXT,
    "archivoMime" TEXT,
    "archivoTamano" INTEGER,

    CONSTRAINT "MensajeChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FaseObligacion_obligacionId_idx" ON "FaseObligacion"("obligacionId");

-- CreateIndex
CREATE UNIQUE INDEX "CasoFaseProgreso_casoId_faseObligacionId_key" ON "CasoFaseProgreso"("casoId", "faseObligacionId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_email_key" ON "PortalUser"("email");

-- CreateIndex
CREATE INDEX "MensajeChat_companyId_createdAt_idx" ON "MensajeChat"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarioSeniat_anio_tipo_digito_mes_quincena_key" ON "CalendarioSeniat"("anio", "tipo", "digito", "mes", "quincena");

-- AddForeignKey
ALTER TABLE "FaseObligacion" ADD CONSTRAINT "FaseObligacion_obligacionId_fkey" FOREIGN KEY ("obligacionId") REFERENCES "Obligacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoFaseProgreso" ADD CONSTRAINT "CasoFaseProgreso_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "CasoRecurrente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoFaseProgreso" ADD CONSTRAINT "CasoFaseProgreso_faseObligacionId_fkey" FOREIGN KEY ("faseObligacionId") REFERENCES "FaseObligacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoFaseProgreso" ADD CONSTRAINT "CasoFaseProgreso_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeChat" ADD CONSTRAINT "MensajeChat_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeChat" ADD CONSTRAINT "MensajeChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeChat" ADD CONSTRAINT "MensajeChat_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

