// Punto de entrada único de los datos iniciales, para el instalador de Windows.
//
// El instalador no tiene TypeScript ni npm: el empaquetador compila este
// archivo a un solo JS con esbuild (semillas/sembrar.js). Por eso todo entra
// por aquí en vez de invocar cada seed por separado.
//
//   node sembrar.js          → instalación limpia (usuarios, reglas, catálogos)
//   node sembrar.js --demo   → además, datos de demostración

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const conDemo = process.argv.includes("--demo");

// Los seeds existentes se ejecutan por import: cada uno llama a su propio
// main() al cargarse, así no hay que duplicar su lógica aquí.
async function main() {
  console.log("Cargando datos iniciales…");

  await import("./seed-users");
  await import("./seed-obligaciones");
  await import("./seed-catalogos-contables");
  await import("./seed-rules");

  if (conDemo) {
    console.log("Cargando datos de demostración…");
    await import("./seed");
    await import("./seed-demo-contable");
  }

  // Las etapas del pipeline solo las crea el seed de demostración; en una
  // instalación limpia hacen falta igual, porque el CRM no funciona sin ellas.
  const etapas = await prisma.pipelineStage.count();
  if (etapas === 0) {
    const flujo: [string, string, string][] = [
      ["Lead", "#64748b", "open"],
      ["Calificación", "#3b82f6", "open"],
      ["Diagnóstico", "#8b5cf6", "open"],
      ["Propuesta", "#f59e0b", "open"],
      ["Cierre", "#f97316", "open"],
      ["Ganado", "#22c55e", "won"],
      ["Perdido", "#ef4444", "lost"],
    ];
    for (const [i, [name, color, type]] of flujo.entries()) {
      await prisma.pipelineStage.create({ data: { name, color, type, order: i } });
    }
    console.log(`  ${flujo.length} etapas del pipeline creadas.`);
  }

  const usuarios = await prisma.user.count();
  console.log(`\nListo. ${usuarios} usuarios registrados.`);
  console.log("El gerente entra con el correo y la clave que fijaste en el instalador.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error al cargar los datos iniciales:", e);
  await prisma.$disconnect();
  process.exit(1);
});
