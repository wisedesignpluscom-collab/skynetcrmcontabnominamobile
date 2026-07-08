// Deriva prisma/schema.postgres.prisma a partir de prisma/schema.prisma.
// El desarrollo local y los tests siguen usando SQLite (schema.prisma sin tocar);
// el despliegue (Netlify) usa PostgreSQL con este archivo generado.
//
// Cambios que aplica:
//   1. datasource:  provider = "sqlite"  →  provider = "postgresql"
//   2. generator:   agrega binaryTargets para el runtime de Netlify (Linux)
//
// Se ejecuta en el build de Netlify y en `npm run setup:prod-db`. El archivo
// resultante está en .gitignore (es derivado, no fuente).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "prisma", "schema.prisma");
const out = join(root, "prisma", "schema.postgres.prisma");

let schema = readFileSync(src, "utf8");

// 1. datasource → PostgreSQL
if (!schema.includes('provider = "sqlite"')) {
  throw new Error('No se encontró provider = "sqlite" en schema.prisma');
}
schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"');

// 2. binaryTargets para que Prisma funcione en las funciones de Netlify (Linux
//    con OpenSSL 3), además de "native" para pruebas locales del build.
schema = schema.replace(
  'provider = "prisma-client-js"',
  'provider = "prisma-client-js"\n  binaryTargets = ["native", "rhel-openssl-3.0.x"]'
);

const header =
  "// ⚠️ ARCHIVO GENERADO — no editar a mano.\n" +
  "// Se deriva de prisma/schema.prisma con: npm run gen:prod-schema\n\n";

writeFileSync(out, header + schema);
console.log("✓ prisma/schema.postgres.prisma generado (PostgreSQL + binaryTargets)");
