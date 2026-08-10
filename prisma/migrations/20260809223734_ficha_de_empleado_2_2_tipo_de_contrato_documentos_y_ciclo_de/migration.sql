-- ficha de empleado 2.2: tipo de contrato, documentos y ciclo de vida
-- Generada con: npm run db:migracion

-- AlterTable
ALTER TABLE "Trabajador" ADD COLUMN     "motivoBaja" TEXT,
ADD COLUMN     "tipoContrato" TEXT;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "trabajadorId" TEXT;

-- CreateTable
CREATE TABLE "TrabajadorDocumento" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrabajadorDocumento_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TrabajadorDocumento" ADD CONSTRAINT "TrabajadorDocumento_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

