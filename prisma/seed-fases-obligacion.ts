// Semilla de la checklist de fases por obligación (condensado del manual de
// procedimientos de la firma: PARTE I — Procedimientos de declaración y pago).
// Cubre las 9 obligaciones más comunes del catálogo; las obligaciones más
// especializadas (grandes patrimonios, juegos de envite, premios de lotería…)
// se dejan sin checklist a propósito — mejor sin plantilla que una inventada.
// No toca datos del CRM. Idempotente por diseño: solo siembra la checklist de
// una obligación si todavía no tiene ninguna fase — así una obligación editada
// a mano desde /configuracion no se pisa al volver a correr este script.
//   npx tsx prisma/seed-fases-obligacion.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CampoSeed = { id: string; label: string; tipo: "texto" | "numero" | "fecha" | "url"; requerido: boolean };
type FaseSeed = { nombre: string; descripcion?: string; campos?: CampoSeed[] };

const campo = (
  id: string,
  label: string,
  tipo: CampoSeed["tipo"],
  requerido = false
): CampoSeed => ({ id, label, tipo, requerido });

// Fases por nombre EXACTO de Obligacion (prisma/seed-obligaciones.ts). Las dos
// obligaciones de IVA (ordinaria y de sujetos pasivos especiales) comparten el
// mismo procedimiento del manual, solo cambia la periodicidad.
const FASES_IVA: FaseSeed[] = [
  {
    nombre: "Cerrar libros de compras y ventas",
    descripcion: "Determinar el débito fiscal (ventas) y el crédito fiscal (compras) del período.",
    campos: [campo("debito", "Débito fiscal", "numero", true), campo("credito", "Crédito fiscal", "numero", true)],
  },
  {
    nombre: "Cargar la declaración en el Portal Fiscal del SENIAT",
    descripcion: "Proceso Tributario → Declaración IVA. Manual, XML o TXT según el volumen.",
    campos: [campo("tipo_decl", "Tipo de declaración", "texto", true)],
  },
  {
    nombre: "Verificar el cálculo del impuesto a pagar",
    descripcion: "Débito − crédito − retenciones de IVA acreditables.",
    campos: [campo("monto", "Monto a pagar", "numero", false)],
  },
  {
    nombre: "Generar la planilla y pagar",
    campos: [campo("fecha_pago", "Fecha de pago", "fecha", true), campo("comprobante", "Comprobante de pago", "url", false)],
  },
  {
    nombre: "Archivar libros y comprobante de declaración",
    campos: [],
  },
];

const FASES: Record<string, FaseSeed[]> = {
  "IVA — Declaración y pago mensual": FASES_IVA,
  "IVA — Sujetos pasivos especiales": FASES_IVA,

  "Retenciones de IVA": [
    {
      nombre: "Verificar el RIF del proveedor en el Portal Fiscal",
      descripcion: "Confirma si corresponde retención del 75% o del 100%.",
      campos: [campo("porcentaje", "Porcentaje aplicado", "texto", true)],
    },
    {
      nombre: "Calcular y pagar el neto al proveedor",
      campos: [campo("monto_retenido", "Monto retenido", "numero", true)],
    },
    {
      nombre: "Emitir el comprobante de retención al proveedor",
      campos: [campo("comprobante", "Comprobante de retención", "url", true)],
    },
    {
      nombre: "Declarar y enterar al SENIAT",
      campos: [campo("fecha_entero", "Fecha de entero", "fecha", true)],
    },
  ],

  "Retenciones de ISLR": [
    {
      nombre: "Calcular la retención (AR-I o tabla art. 9)",
      campos: [campo("porcentaje", "Porcentaje aplicado", "texto", true)],
    },
    {
      nombre: "Aplicar y enterar la retención del período",
      campos: [campo("monto_enterado", "Monto enterado", "numero", true)],
    },
    {
      nombre: "Emitir el comprobante al beneficiario",
      campos: [campo("comprobante", "Comprobante", "url", false)],
    },
    {
      nombre: "Archivar la declaración informativa",
      campos: [],
    },
  ],

  "ISLR — Declaración definitiva": [
    {
      nombre: "Preparar la conciliación fiscal de la renta",
      campos: [campo("enriquecimiento", "Enriquecimiento neto gravable", "numero", true)],
    },
    {
      nombre: "Declarar en el Portal Fiscal del SENIAT",
      campos: [],
    },
    {
      nombre: "Adjuntar comprobantes ARC de retenciones recibidas",
      campos: [campo("arc", "Comprobantes ARC", "url", false)],
    },
    {
      nombre: "Pagar el impuesto resultante (si aplica)",
      campos: [campo("monto_pagado", "Monto pagado", "numero", false)],
    },
    {
      nombre: "Archivar la planilla de confirmación",
      campos: [campo("comprobante", "Comprobante", "url", true)],
    },
  ],

  "Seguro Social Obligatorio (IVSS)": [
    {
      nombre: "Revisar la facturación del período en TIUNA",
      campos: [],
    },
    {
      nombre: "Cotejar contra la nómina real",
      campos: [campo("trabajadores", "Trabajadores reportados", "numero", false)],
    },
    {
      nombre: "Pagar dentro del plazo",
      campos: [campo("fecha_pago", "Fecha de pago", "fecha", true)],
    },
    {
      nombre: "Conservar el comprobante de pago",
      campos: [campo("comprobante", "Comprobante", "url", true)],
    },
  ],

  "FAOV — Ahorro habitacional (BANAVIH)": [
    {
      nombre: "Calcular el 3% sobre el salario integral",
      campos: [campo("monto", "Monto calculado", "numero", true)],
    },
    {
      nombre: "Cargar la nómina en BANAVIH EN LÍNEA",
      campos: [],
    },
    {
      nombre: "Conciliar y generar la planilla",
      campos: [],
    },
    {
      nombre: "Pagar en banco autorizado o pasarela",
      campos: [campo("fecha_pago", "Fecha de pago", "fecha", true)],
    },
    {
      nombre: "Archivar soporte de pago y reporte de nómina",
      campos: [campo("comprobante", "Comprobante", "url", true)],
    },
  ],

  "INCES — Aporte trimestral": [
    {
      nombre: "Totalizar remuneraciones del trimestre",
      campos: [campo("total", "Total remuneraciones", "numero", true)],
    },
    {
      nombre: "Declarar el 2% (y el 0,5% si hubo utilidades)",
      campos: [],
    },
    {
      nombre: "Pagar la planilla",
      campos: [campo("fecha_pago", "Fecha de pago", "fecha", true)],
    },
    {
      nombre: "Conservar el reporte trimestral del aporte",
      campos: [campo("comprobante", "Comprobante", "url", true)],
    },
  ],

  "Impuesto sobre Actividades Económicas": [
    {
      nombre: "Determinar los ingresos brutos del período",
      campos: [campo("ingresos", "Ingresos brutos", "numero", true)],
    },
    {
      nombre: "Declarar en el portal de la administración municipal",
      campos: [],
    },
    {
      nombre: "Pagar el impuesto resultante",
      campos: [campo("fecha_pago", "Fecha de pago", "fecha", true)],
    },
    {
      nombre: "Archivar el comprobante de declaración y pago",
      campos: [campo("comprobante", "Comprobante", "url", true)],
    },
  ],
};

async function main() {
  let sembradas = 0;
  let saltadas = 0;

  for (const [nombreObligacion, fases] of Object.entries(FASES)) {
    const obligacion = await prisma.obligacion.findFirst({ where: { nombre: nombreObligacion } });
    if (!obligacion) {
      console.log(`Sin obligación «${nombreObligacion}» — se omite (¿corriste seed-obligaciones.ts?).`);
      continue;
    }
    const existentes = await prisma.faseObligacion.count({ where: { obligacionId: obligacion.id } });
    if (existentes > 0) {
      saltadas++;
      continue;
    }
    for (const [i, fase] of fases.entries()) {
      await prisma.faseObligacion.create({
        data: {
          obligacionId: obligacion.id,
          order: (i + 1) * 10,
          nombre: fase.nombre,
          descripcion: fase.descripcion ?? null,
          campos: JSON.stringify(fase.campos ?? []),
        },
      });
    }
    sembradas++;
  }

  console.log(`Listo: ${sembradas} obligaciones con checklist nueva, ${saltadas} ya tenían fases (sin tocar).`);
  await prisma.$disconnect();
}

main();
