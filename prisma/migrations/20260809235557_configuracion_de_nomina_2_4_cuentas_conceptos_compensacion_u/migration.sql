-- configuracion de nomina 2.4: cuentas, conceptos, compensacion usd, beneficios y parametros legales
-- Generada con: npm run db:migracion

-- AlterTable
ALTER TABLE "Trabajador" ADD COLUMN     "objetivoUsd" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ConfiguracionNomina" ADD COLUMN     "anticiposPrestamosActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anticiposPrestamosNotas" TEXT,
ADD COLUMN     "bonoGuerraOverride" DOUBLE PRECISION,
ADD COLUMN     "cestaticketMensualOverride" DOUBLE PRECISION,
ADD COLUMN     "cestaticketObjetivoUsd" DOUBLE PRECISION,
ADD COLUMN     "compensacionUsdActiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "compensacionUsdObjetivo" DOUBLE PRECISION,
ADD COLUMN     "cuentaDeduccionesPorPagar" TEXT,
ADD COLUMN     "cuentaGastoSueldos" TEXT,
ADD COLUMN     "cuentaNominaPorPagarUSD" TEXT,
ADD COLUMN     "cuentaNominaPorPagarVES" TEXT,
ADD COLUMN     "jornadaSemanalHorasOverride" DOUBLE PRECISION,
ADD COLUMN     "parametrosPersonalizados" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "salarioMinimoOverride" DOUBLE PRECISION,
ADD COLUMN     "utilidadesDiasAnio" INTEGER,
ADD COLUMN     "utilidadesDiasMax" INTEGER,
ADD COLUMN     "utilidadesDiasMin" INTEGER,
ADD COLUMN     "utilidadesTipoDistribucion" TEXT NOT NULL DEFAULT 'pago_unico_diciembre',
ADD COLUMN     "vacacionesBonoDiasExtra" INTEGER,
ADD COLUMN     "vacacionesColectivas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vacacionesDiasExtra" INTEGER,
ADD COLUMN     "valorUTOverride" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ConceptoNomina" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clave" TEXT,
    "nombre" TEXT NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "formulaAyuda" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptoNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AporteLegal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "clave" TEXT,
    "nombre" TEXT NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AporteLegal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConceptoNomina_companyId_clave_key" ON "ConceptoNomina"("companyId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "AporteLegal_companyId_clave_key" ON "AporteLegal"("companyId", "clave");

-- AddForeignKey
ALTER TABLE "ConceptoNomina" ADD CONSTRAINT "ConceptoNomina_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AporteLegal" ADD CONSTRAINT "AporteLegal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

