// Arma el paquete que consume el instalador de Windows.
//
//   npm run empaquetar
//
// Deja todo en dist/windows/ con esta forma, que es la que espera
// instalador/skynet-crm.iss y la que quedará en C:\SkynetCRM:
//
//   app/            servidor de Next (standalone) + estáticos + public
//   node/           runtime de Node para Windows (el servidor no instala Node)
//   postgres/       binarios de PostgreSQL (el servidor no instala PostgreSQL)
//   prisma/         esquema de PostgreSQL + migraciones
//   node_modules/   solo prisma, para poder correr `migrate deploy`
//   semillas/       datos iniciales compilados a JS
//   instalador/     scripts de configuración, respaldo y panel de bandeja
//   iniciar-servidor.cmd
//
// Node y PostgreSQL se descargan de sus sitios oficiales la primera vez y
// quedan cacheados en .cache-empaquetado/ para no bajarlos en cada corrida.

import { execFileSync } from "node:child_process";
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist", "windows");
const cache = join(root, ".cache-empaquetado");

// Versiones fijadas a propósito: un instalador reproducible no debe cambiar
// porque hoy salió una versión nueva. Se suben a mano y se prueba.
const NODE_VERSION = "22.11.0";
const PG_VERSION = "16.4-1";
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const PG_URL = `https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-windows-x64-binaries.zip`;
// PostgreSQL para Windows depende del runtime de Visual C++: sin él initdb
// falla con un error de DLL que no orienta a nadie.
const VC_URL = "https://aka.ms/vs/17/release/vc_redist.x64.exe";

const paso = (t) => console.log(`\n== ${t}`);
const ok = (t) => console.log(`   ✓ ${t}`);
const aviso = (t) => console.log(`   ! ${t}`);

function correr(cmd, args, opciones = {}) {
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opciones });
}

function mb(ruta) {
  let total = 0;
  const recorrer = (p) => {
    const s = statSync(p);
    if (s.isDirectory()) {
      for (const hijo of readdirSync(p)) recorrer(join(p, hijo));
    } else total += s.size;
  };
  try { recorrer(ruta); } catch { return "?"; }
  return (total / 1024 / 1024).toFixed(0);
}

// Copia resolviendo enlaces simbólicos (Windows no los sigue). Se prefiere
// rsync porque cpSync falla con ENOTSUP sobre discos exFAT, que es donde suele
// vivir este proyecto; si no está, se usa el copiado de Node.
const hayRsync = (() => {
  try {
    execFileSync("rsync", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function copiar(desde, hasta) {
  if (hayRsync) {
    mkdirSync(hasta, { recursive: true });
    // La barra final en el origen copia el CONTENIDO, no la carpeta
    execFileSync("rsync", ["-a", "--copy-links", `${desde}/`, `${hasta}/`], { stdio: "inherit" });
  } else {
    cpSync(desde, hasta, { recursive: true, dereference: true });
  }
}

// ── 0. Limpieza ─────────────────────────────────────────────────────────────
paso("Limpiando la carpeta de salida");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
mkdirSync(cache, { recursive: true });

// ── 1. Compilar la aplicación ───────────────────────────────────────────────
paso("Compilando la aplicación (esto tarda)");
// El esquema debe pedir el motor de Prisma para Windows: sin él la aplicación
// no arranca en el servidor del cliente (el "native" es el de esta máquina).
process.env.EMPAQUETAR_WINDOWS = "1";
correr("npm", ["run", "gen:prod-schema"], { env: process.env });
// El cliente de Prisma debe generarse contra PostgreSQL: es el motor del
// servidor. Si se empaqueta el de SQLite, la app no arranca en el cliente.
correr("npx", ["prisma", "generate", "--schema=prisma/schema.postgres.prisma"], { env: process.env });
correr("npm", ["run", "build"]);

const standalone = join(root, ".next", "standalone");
if (!existsSync(standalone)) {
  console.error(
    '\nNo se generó .next/standalone. Revisa que next.config.ts tenga output: "standalone".'
  );
  process.exit(1);
}

paso("Copiando la aplicación");
const app = join(dist, "app");
copiar(standalone, app);
// El standalone no incluye los estáticos ni public: hay que copiarlos al lado
copiar(join(root, ".next", "static"), join(app, ".next", "static"));
if (existsSync(join(root, "public"))) {
  copiar(join(root, "public"), join(app, "public"));
}
// Icono para los accesos directos de Windows (el favicon vive en app/, no en public/)
if (existsSync(join(root, "app", "favicon.ico"))) {
  cpSync(join(root, "app", "favicon.ico"), join(dist, "skynet.ico"));
}
ok(`app/ (${mb(app)} MB)`);

// ── 2. Esquema y migraciones ────────────────────────────────────────────────
paso("Copiando el esquema y las migraciones");
mkdirSync(join(dist, "prisma"), { recursive: true });
cpSync(join(root, "prisma", "schema.postgres.prisma"), join(dist, "prisma", "schema.postgres.prisma"));
copiar(join(root, "prisma", "migrations"), join(dist, "prisma", "migrations"));

// Prisma CLI, para `migrate deploy` en el servidor del cliente
for (const paquete of ["prisma", "@prisma/client", "@prisma/engines", ".prisma"]) {
  const desde = join(root, "node_modules", paquete);
  if (existsSync(desde)) {
    copiar(desde, join(dist, "node_modules", paquete));
  }
}
ok("prisma/ + node_modules/prisma");

// ── 3. Semillas compiladas a JS ─────────────────────────────────────────────
paso("Compilando los datos iniciales");
mkdirSync(join(dist, "semillas"), { recursive: true });
correr("npx", [
  "esbuild",
  "prisma/sembrar-instalacion.ts",
  "--bundle",
  "--platform=node",
  "--target=node22",
  "--format=cjs",
  "--external:@prisma/client",
  "--external:bcryptjs",
  `--outfile=${join(dist, "semillas", "sembrar.js")}`,
]);
// bcryptjs lo usa el seed de usuarios
for (const paquete of ["bcryptjs"]) {
  const desde = join(root, "node_modules", paquete);
  if (existsSync(desde)) copiar(desde, join(dist, "node_modules", paquete));
}
ok("semillas/sembrar.js");

// ── 4. Scripts del instalador ───────────────────────────────────────────────
paso("Copiando los scripts de instalación");
copiar(join(root, "instalador", "recursos"), join(dist, "instalador"));
cpSync(join(dist, "instalador", "iniciar-servidor.cmd"), join(dist, "iniciar-servidor.cmd"));
rmSync(join(dist, "instalador", "iniciar-servidor.cmd"));
ok("instalador/ + iniciar-servidor.cmd");

// ── 5. Node y PostgreSQL para Windows ───────────────────────────────────────
async function descargar(url, destino) {
  if (existsSync(destino)) {
    ok(`ya estaba en caché: ${destino.split("/").pop()}`);
    return true;
  }
  console.log(`   Descargando ${url}`);
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(destino, buf);
    ok(`descargado (${(buf.length / 1024 / 1024).toFixed(0)} MB)`);
    return true;
  } catch (e) {
    aviso(`No se pudo descargar: ${e.message}`);
    return false;
  }
}

paso("Runtime de Node y binarios de PostgreSQL para Windows");
const zipNode = join(cache, `node-v${NODE_VERSION}-win-x64.zip`);
const zipPg = join(cache, `postgresql-${PG_VERSION}-windows-x64-binaries.zip`);
const faltantes = [];
if (!(await descargar(NODE_URL, zipNode))) faltantes.push(["Node", NODE_URL, zipNode]);
if (!(await descargar(PG_URL, zipPg))) faltantes.push(["PostgreSQL", PG_URL, zipPg]);
const vcRedist = join(cache, "vc_redist.x64.exe");
if (await descargar(VC_URL, vcRedist)) {
  cpSync(vcRedist, join(dist, "vc_redist.x64.exe"));
  ok("vc_redist.x64.exe (runtime de Visual C++ para PostgreSQL)");
} else {
  faltantes.push(["Runtime de Visual C++", VC_URL, vcRedist]);
}

// Descomprimir dentro del paquete: el instalador copia carpetas, no ZIPs
function descomprimir(zip, carpetaDentroDelZip, destino) {
  const temporal = join(cache, "temporal");
  rmSync(temporal, { recursive: true, force: true });
  mkdirSync(temporal, { recursive: true });
  execFileSync("unzip", ["-q", zip, "-d", temporal], { stdio: "inherit" });
  copiar(join(temporal, carpetaDentroDelZip), destino);
  rmSync(temporal, { recursive: true, force: true });
}

if (faltantes.length === 0) {
  paso("Descomprimiendo Node y PostgreSQL en el paquete");
  descomprimir(zipNode, `node-v${NODE_VERSION}-win-x64`, join(dist, "node"));
  ok(`node/ (${mb(join(dist, "node"))} MB)`);

  descomprimir(zipPg, "pgsql", join(dist, "postgres"));
  // El paquete de binarios trae documentación y cabeceras de desarrollo que el
  // servidor no usa: quitarlas ahorra ~100 MB en el instalador.
  for (const sobra of ["doc", "include", "pgAdmin 4", "StackBuilder", "symbols"]) {
    rmSync(join(dist, "postgres", sobra), { recursive: true, force: true });
  }
  ok(`postgres/ (${mb(join(dist, "postgres"))} MB)`);
}

writeFileSync(
  join(dist, "COMPONENTES.txt"),
  `Componentes de terceros que el instalador debe descomprimir en el servidor:\n\n` +
    `node/      ← ${zipNode}\n           (contenido de node-v${NODE_VERSION}-win-x64/)\n` +
    `postgres/  ← ${zipPg}\n           (contenido de pgsql/)\n\n` +
    `Descargas oficiales:\n  ${NODE_URL}\n  ${PG_URL}\n`
);

// La clave privada de firma NUNCA se empaqueta: si saliera de esta máquina,
// cualquiera podría emitir licencias.
if (existsSync(join(dist, "claves-licencia"))) {
  rmSync(join(dist, "claves-licencia"), { recursive: true, force: true });
  aviso("Se eliminó claves-licencia del paquete (no debe distribuirse)");
}

// ── 6. Manifiesto ───────────────────────────────────────────────────────────
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
writeFileSync(
  join(dist, "version.json"),
  JSON.stringify(
    { version, nodeVersion: NODE_VERSION, pgVersion: PG_VERSION, empaquetado: new Date().toISOString() },
    null,
    2
  )
);

console.log(`\n── Paquete listo en dist/windows (${mb(dist)} MB) ──`);
if (faltantes.length > 0) {
  console.log("\nFALTAN componentes de terceros (sin red al empaquetar):");
  for (const [nombre, url, destino] of faltantes) {
    console.log(`  · ${nombre}: baja ${url}`);
    console.log(`    y guárdalo en ${destino}`);
  }
  console.log("\nLuego vuelve a correr:  npm run empaquetar");
  process.exit(2);
}
console.log("\nSiguiente paso: compilar el instalador con Inno Setup (ver instalador/README.md).");
