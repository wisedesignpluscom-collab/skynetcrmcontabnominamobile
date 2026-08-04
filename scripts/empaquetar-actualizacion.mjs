// Arma el paquete LIGERO que actualiza una instalación ya existente.
//
//   npm run actualizacion            (compila todo y extrae lo que cambia)
//   npm run actualizacion -- --usar-dist   (reutiliza dist/windows ya compilado)
//
// Deja dist/actualizacion/ con:
//
//   app/                 la aplicación
//   prisma/              esquema de PostgreSQL + migraciones
//   semillas/            datos iniciales compilados
//   actualizacion.json   qué versión es y qué runtime espera
//
// QUÉ NO LLEVA, Y POR QUÉ
//
// Node (471 MB) y PostgreSQL (311 MB) no cambian entre versiones del CRM: son
// el runtime del servidor, no la aplicación. Mandarlos otra vez para corregir
// una pantalla es tirar tres cuartas partes de la descarga a la basura. Si
// alguna vez SÍ cambian, actualizar.ps1 lo detecta comparando este manifiesto
// contra el version.json instalado y manda usar el instalador completo.
//
// Tampoco lleva instalador/: son los scripts que están corriendo durante la
// actualización (el panel de la bandeja tiene bandeja.ps1 abierto y Windows lo
// bloquea). Un cambio en esos scripts exige el instalador completo.
//
// La aplicación se compila con el empaquetado completo y de ahí se extrae el
// subconjunto: así lo que se envía es EXACTAMENTE lo que pondría el instalador,
// sin una segunda ruta de compilación que se desincronice con el tiempo.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distCompleto = join(root, "dist", "windows");
const dist = join(root, "dist", "actualizacion");

const CARPETAS = ["app", "prisma", "semillas"];

const paso = (t) => console.log(`\n== ${t}`);
const ok = (t) => console.log(`   ✓ ${t}`);

function mb(ruta) {
  let total = 0;
  const recorrer = (p) => {
    const s = statSync(p);
    if (s.isDirectory()) for (const h of readdirSync(p)) recorrer(join(p, h));
    else total += s.size;
  };
  try { recorrer(ruta); } catch { return "?"; }
  return (total / 1024 / 1024).toFixed(0);
}

// ── 1. Compilar ─────────────────────────────────────────────────────────────

const usarDist = process.argv.includes("--usar-dist");

if (usarDist) {
  if (!existsSync(join(distCompleto, "app"))) {
    console.error("\nNo hay dist/windows compilado. Corre sin --usar-dist.");
    process.exit(1);
  }
  paso("Reutilizando dist/windows ya compilado");
} else {
  paso("Compilando la aplicación (esto tarda)");
  execFileSync("npm", ["run", "empaquetar"], { cwd: root, stdio: "inherit" });
}

// ── 2. Extraer lo que cambia ────────────────────────────────────────────────

paso("Extrayendo el paquete de actualización");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const c of CARPETAS) {
  const desde = join(distCompleto, c);
  if (!existsSync(desde)) {
    console.error(`\nFalta ${c}/ en dist/windows. ¿El empaquetado terminó bien?`);
    process.exit(1);
  }
  cpSync(desde, join(dist, c), { recursive: true });
  ok(`${c}/ (${mb(join(dist, c))} MB)`);
}

// ── 3. Manifiesto ───────────────────────────────────────────────────────────

// Node y Prisma viven FUERA de lo que esta actualización reemplaza. Se anotan
// para que el servidor pueda negarse si no coinciden, en vez de arrancar roto.
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const prismaVersion = JSON.parse(
  readFileSync(join(root, "node_modules", "prisma", "package.json"), "utf8")
).version;
const completo = existsSync(join(distCompleto, "version.json"))
  ? JSON.parse(readFileSync(join(distCompleto, "version.json"), "utf8"))
  : {};

writeFileSync(
  join(dist, "actualizacion.json"),
  JSON.stringify(
    {
      version,
      nodeVersion: completo.nodeVersion ?? null,
      pgVersion: completo.pgVersion ?? null,
      prismaVersion,
      empaquetado: new Date().toISOString(),
    },
    null,
    2
  )
);
ok(`actualizacion.json (versión ${version}, Node ${completo.nodeVersion}, Prisma ${prismaVersion})`);

console.log(`\n── Paquete de actualización listo en dist/actualizacion (${mb(dist)} MB) ──`);
console.log(`   El instalador completo pesa ${mb(distCompleto)} MB.`);
console.log("\nSiguiente paso:  npm run actualizador   (genera el .exe que se le envía al cliente)");
