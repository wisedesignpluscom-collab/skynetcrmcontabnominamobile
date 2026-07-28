// Deriva prisma/schema.postgres.prisma a partir de prisma/schema.prisma.
// El desarrollo local y los tests siguen usando SQLite (schema.prisma sin tocar);
// el despliegue en la nube (Vercel) usa PostgreSQL con este archivo generado.
//
// Cambios que aplica:
//   1. datasource:  provider = "sqlite"  →  provider = "postgresql"
//   2. datasource:  agrega directUrl (conexión directa) para migraciones/db push,
//      mientras DATABASE_URL usa el pooler (Supabase pgBouncer, port 6543) en
//      runtime serverless.
//   3. generator:   agrega binaryTargets para el runtime en la nube (Linux OpenSSL 3;
//      sirve para Vercel y Netlify).
//
// Se ejecuta en el build de la nube y en `npm run setup:prod-db`. El archivo
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

// 2. directUrl para migraciones/db push (conexión directa, port 5432), mientras
//    DATABASE_URL apunta al pooler (Supabase pgBouncer, port 6543) en runtime.
if (!schema.includes('url      = env("DATABASE_URL")')) {
  throw new Error('No se encontró url = env("DATABASE_URL") en schema.prisma');
}
schema = schema.replace(
  'url      = env("DATABASE_URL")',
  'url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")'
);

// 3. binaryTargets para que Prisma funcione en las funciones de la nube (Linux
//    con OpenSSL 3; sirve para Vercel y Netlify), además de "native" para el build.
// Cuando se empaqueta para el servidor Windows del cliente hace falta SU motor:
// "native" es el de la máquina que compila (macOS), y sin el de Windows la
// aplicación no arranca allá. Lo activa scripts/empaquetar-windows.mjs.
const paraWindows = process.env.EMPAQUETAR_WINDOWS === "1";
const targets = paraWindows
  ? '["native", "windows", "rhel-openssl-3.0.x"]'
  : '["native", "rhel-openssl-3.0.x"]';

schema = schema.replace(
  'provider = "prisma-client-js"',
  `provider = "prisma-client-js"\n  binaryTargets = ${targets}`
);

const header =
  "// ⚠️ ARCHIVO GENERADO — no editar a mano.\n" +
  "// Se deriva de prisma/schema.prisma con: npm run gen:prod-schema\n\n";

writeFileSync(out, header + schema);
console.log("✓ prisma/schema.postgres.prisma generado (PostgreSQL + binaryTargets)");
