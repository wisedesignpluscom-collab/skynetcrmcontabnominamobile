// Crea la siguiente migración de PostgreSQL a partir de los cambios que hayas
// hecho en prisma/schema.prisma.
//
//   npm run db:migracion "agrega tabla de recibos"
//
// Por qué existe (en vez de `prisma migrate dev`): el desarrollo local usa
// SQLite y las migraciones son de PostgreSQL, que es el motor de producción.
// `prisma migrate dev` exigiría tener un PostgreSQL levantado y una "shadow
// database". Aquí se compara el esquema anterior (prisma/baseline/) contra el
// actual, así que **no hace falta ninguna base de datos** para generar la
// migración: solo dos archivos de texto.
//
// El resultado queda en prisma/migrations/<fecha>_<nombre>/migration.sql y se
// aplica en el servidor del cliente con:  npm run db:aplicar

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaProd = join(root, "prisma", "schema.postgres.prisma");
const baseline = join(root, "prisma", "baseline", "schema.migrada.prisma");
const migrationsDir = join(root, "prisma", "migrations");

const nombreCrudo = process.argv.slice(2).join(" ").trim();
if (!nombreCrudo) {
  console.error('Falta el nombre. Ejemplo:  npm run db:migracion "agrega tabla de recibos"');
  process.exit(1);
}

// "Agrega tabla de recibos" → "agrega_tabla_de_recibos"
const nombre = nombreCrudo
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 60);

// 1. Regenerar el esquema de PostgreSQL desde el de desarrollo
execFileSync("node", [join(root, "scripts", "gen-prod-schema.mjs")], { stdio: "inherit" });

if (!existsSync(baseline)) {
  console.error(
    `No existe ${baseline}.\n` +
      "Es la foto del esquema en la última migración. Si se perdió, recupérala del repositorio."
  );
  process.exit(1);
}

// 2. Diferencia entre lo ya migrado y lo actual (sin tocar ninguna base de datos)
const sql = execFileSync(
  "npx",
  [
    "prisma",
    "migrate",
    "diff",
    "--from-schema-datamodel",
    baseline,
    "--to-schema-datamodel",
    schemaProd,
    "--script",
  ],
  { cwd: root, encoding: "utf8" }
);

if (sql.trim() === "" || sql.includes("This is an empty migration")) {
  console.log("\nNo hay cambios de esquema pendientes: no se creó ninguna migración.");
  process.exit(0);
}

// 3. Escribir la migración
const ts = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14); // aaaammddhhmmss
const carpeta = join(migrationsDir, `${ts}_${nombre}`);
mkdirSync(carpeta, { recursive: true });
const archivo = join(carpeta, "migration.sql");
writeFileSync(
  archivo,
  `-- ${nombreCrudo}\n-- Generada con: npm run db:migracion\n\n${sql}`
);

// 4. Actualizar la foto del esquema migrado
copyFileSync(schemaProd, baseline);

const lineas = sql.trim().split("\n").length;
console.log(`\n✓ Migración creada: prisma/migrations/${ts}_${nombre}/migration.sql (${lineas} líneas)`);
console.log("  Revísala antes de commitear — sobre todo si borra columnas o tablas.");

// Aviso cuando la migración puede perder datos
const peligrosas = ["DROP TABLE", "DROP COLUMN", "ALTER COLUMN"];
const encontradas = peligrosas.filter((p) => sql.toUpperCase().includes(p));
if (encontradas.length > 0) {
  console.log(
    `\n⚠  Contiene ${encontradas.join(", ")}: puede BORRAR datos del cliente.\n` +
      "   Revisa el SQL a mano y, si hace falta, agrega los pasos para migrar los datos existentes."
  );
}

// Recordatorio del contenido, para no commitear a ciegas
const previa = readFileSync(archivo, "utf8").split("\n").slice(0, 12).join("\n");
console.log(`\n── Primeras líneas ──\n${previa}\n`);
