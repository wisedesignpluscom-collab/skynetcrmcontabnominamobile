// Deja el cliente de Prisma en sintonía con la base a la que apunta DATABASE_URL.
//
//   npm run db:cliente     (a mano)
//   npm run dev            (automático, antes de levantar el servidor)
//
// EL PROBLEMA QUE RESUELVE
//
// Este proyecto tiene dos esquemas —SQLite para desarrollo y PostgreSQL para el
// servidor del cliente— pero `prisma generate` escribe siempre en el MISMO sitio:
// node_modules/.prisma/client. Gana el último que corrió, y nada avisa.
//
// Los comandos que dejan el cliente en modo PostgreSQL son `db:aplicar`,
// `setup:prod-db`, `build:vercel` y sobre todo `empaquetar` (que lo necesita así
// para meter el motor de Windows en el instalador). Después de cualquiera de
// ellos, el desarrollo local queda roto: toda consulta muere con
//
//   Error validating datasource `db`: the URL must start with the protocol `postgresql://`
//
// y el mensaje culpa al esquema, que está bien. Lo que está mal es el cliente
// compilado. Cuesta encontrarlo porque no hay ningún archivo del repositorio
// modificado que lo delate.
//
// CÓMO LO RESUELVE
//
// Compara el proveedor del cliente generado contra el protocolo de DATABASE_URL
// y regenera solo si no coinciden. En el caso normal lee dos archivos y termina
// en milisegundos, así que puede ir colgado de `npm run dev` sin costo.
//
// No se cuelga de `build` a propósito: `empaquetar` llama a `npm run build` con
// el cliente de PostgreSQL ya puesto, y regenerarlo ahí metería el motor de
// SQLite en el instalador del cliente.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clienteGenerado = join(root, "node_modules", ".prisma", "client", "schema.prisma");

// ── Qué base pide el entorno ────────────────────────────────────────────────

function urlDeLaBase() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = join(root, ".env");
  if (!existsSync(env)) return "";
  // Basta con la primera aparición: es como la lee Next
  const linea = readFileSync(env, "utf8").match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
  return linea ? linea[1].trim().replace(/^["']|["']$/g, "") : "";
}

const url = urlDeLaBase();
let proveedorPedido;
if (url.startsWith("file:")) proveedorPedido = "sqlite";
else if (url.startsWith("postgres://") || url.startsWith("postgresql://")) proveedorPedido = "postgresql";
else {
  // Sin DATABASE_URL legible no hay nada que comparar. No es tarea de este
  // script explicar esa falta: Prisma lo dirá mucho mejor cuando se use.
  process.exit(0);
}

// ── Qué base tiene el cliente que hay compilado ─────────────────────────────

function proveedorActual() {
  if (!existsSync(clienteGenerado)) return null;
  // Solo el datasource: el generator también dice "provider", pero vale
  // "prisma-client-js" y nunca choca con estos dos.
  const m = readFileSync(clienteGenerado, "utf8").match(/provider\s*=\s*"(sqlite|postgresql)"/);
  return m ? m[1] : null;
}

const actual = proveedorActual();
if (actual === proveedorPedido) process.exit(0);

// ── Regenerar ───────────────────────────────────────────────────────────────

const motivo = actual
  ? `el cliente estaba generado para ${actual} y DATABASE_URL apunta a ${proveedorPedido}`
  : "no había cliente generado";
console.log(`  Regenerando el cliente de Prisma: ${motivo}.`);

const correr = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

if (proveedorPedido === "postgresql") {
  correr("npm", ["run", "gen:prod-schema"]);
  correr("npx", ["prisma", "generate", "--schema=prisma/schema.postgres.prisma"]);
} else {
  correr("npx", ["prisma", "generate"]);
}
