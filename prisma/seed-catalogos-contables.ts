// Catálogos del negocio contable (municipios, régimen tributario, tamaño).
//
// ADITIVO a propósito: no borra nada, solo agrega las opciones que falten. Se
// puede correr sobre una base con datos reales:
//   npx tsx prisma/seed-catalogos-contables.ts
//
// Los municipios son los del estado Lara (donde opera la firma); cada instancia
// los amplía desde /configuracion sin tocar código.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const catalogos: [string, string[]][] = [
  [
    "municipio",
    [
      "Iribarren",
      "Palavecino",
      "Crespo",
      "Jiménez",
      "Morán",
      "Torres",
      "Urdaneta",
      "Andrés Eloy Blanco",
      "Simón Planas",
    ],
  ],
  [
    "regimen_tributario",
    ["Contribuyente ordinario", "Contribuyente especial", "Contribuyente formal"],
  ],
  [
    "tamano_empresa",
    [
      "Micro (hasta $2.000/mes)",
      "Pequeña ($2.000 - $10.000/mes)",
      "Mediana ($10.000 - $50.000/mes)",
      "Grande (más de $50.000/mes)",
    ],
  ],
  // El sector económico ya existía como catálogo; se completa con los rubros
  // que menciona la especificación del cliente.
  ["industry", ["Comercio", "Servicios", "Manufactura", "Transporte", "Construcción", "Agropecuario"]],
];

async function main() {
  let creados = 0;
  for (const [category, labels] of catalogos) {
    // El orden arranca después de lo que ya exista en la categoría
    const existentes = await prisma.catalogOption.count({ where: { category } });
    let order = existentes;
    for (const label of labels) {
      const yaEsta = await prisma.catalogOption.findUnique({
        where: { category_label: { category, label } },
      });
      if (yaEsta) continue;
      await prisma.catalogOption.create({ data: { category, label, order: order++ } });
      creados++;
    }
  }
  console.log(`✓ Catálogos contables listos (${creados} opciones nuevas)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
