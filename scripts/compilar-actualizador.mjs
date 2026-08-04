// Genera SkynetCRM-Actualizar.exe desde este mismo equipo (macOS o Linux).
//
//   npm run actualizador
//
// Antes hay que haber corrido `npm run actualizacion`, que deja
// dist/actualizacion/ con la aplicación, el esquema y las semillas.
//
// El .exe resultante se le envía al cliente: doble clic en el servidor y el
// sistema queda actualizado sin preguntar contraseñas.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist", "actualizacion");
const guion = join(root, "instalador", "skynet-crm-actualizacion.nsi");
const salida = join(root, "instalador", "salida");
const exe = join(salida, "SkynetCRM-Actualizar.exe");

const paso = (t) => console.log(`\n== ${t}`);
const ok = (t) => console.log(`   ✓ ${t}`);

function morir(titulo, ...detalle) {
  console.error(`\n✗ ${titulo}\n`);
  for (const linea of detalle) console.error(`  ${linea}`);
  console.error("");
  process.exit(1);
}

// ── 1. ¿Está el paquete? ────────────────────────────────────────────────────
paso("Revisando el paquete de actualización");

const obligatorios = [
  ["app", "la aplicación compilada"],
  ["prisma", "el esquema y las migraciones"],
  ["semillas", "los datos iniciales"],
  ["actualizacion.json", "el manifiesto de versión"],
];

if (!existsSync(dist)) {
  morir("No existe dist/actualizacion.", "Corre primero:   npm run actualizacion");
}
const faltan = obligatorios.filter(([n]) => !existsSync(join(dist, n)));
if (faltan.length > 0) {
  morir(
    "El paquete de actualización está incompleto.",
    "Falta en dist/actualizacion:",
    ...faltan.map(([n, q]) => `  · ${n}  (${q})`),
    "",
    "Vuelve a correr:   npm run actualizacion"
  );
}

// Mismo control que el instalador completo: un binario de macOS dentro del
// paquete no falla al compilar, pero rompe la aplicación en el servidor.
if (existsSync(join(dist, "app", "node_modules", "@img"))) {
  morir(
    "El paquete lleva binarios nativos que no son de Windows.",
    `Se encontró ${join(dist, "app", "node_modules", "@img")}`,
    "",
    "Vuelve a correr:   npm run actualizacion"
  );
}

if (!existsSync(join(root, "instalador", "recursos", "actualizar.ps1"))) {
  morir("Falta instalador/recursos/actualizar.ps1, que es quien hace el trabajo.");
}
if (!existsSync(join(root, "instalador", "recursos", "skynet.ico"))) {
  morir("Falta instalador/recursos/skynet.ico.", "Corre:   npm run empaquetar");
}
ok("dist/actualizacion completo");

// ── 2. ¿Está NSIS? ──────────────────────────────────────────────────────────
paso("Revisando NSIS");

let versionNsis;
try {
  versionNsis = execFileSync("makensis", ["-VERSION"], { encoding: "utf8" }).trim();
} catch {
  morir(
    "No está instalado makensis (NSIS), que es quien genera el .exe.",
    "En macOS:   brew install makensis",
    "En Linux:   sudo apt install nsis"
  );
}
ok(`makensis ${versionNsis}`);

// ── 3. Compilar ─────────────────────────────────────────────────────────────
mkdirSync(salida, { recursive: true });

const manifiesto = JSON.parse(readFileSync(join(dist, "actualizacion.json"), "utf8"));
const version = manifiesto.version;

paso(`Compilando el actualizador (versión ${version})`);

const inicio = Date.now();
try {
  execFileSync(
    "makensis",
    ["-V2", "-INPUTCHARSET", "UTF8", `-DVERSION=${version}`, guion],
    { cwd: join(root, "instalador"), stdio: "inherit" }
  );
} catch {
  morir("NSIS no pudo generar el actualizador.", "El detalle está arriba, en la salida de makensis.");
}

if (!existsSync(exe)) {
  morir("makensis terminó pero no dejó el .exe.", `Se esperaba en ${exe}`);
}

const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
const tamano = (statSync(exe).size / 1024 / 1024).toFixed(0);

console.log(`\n── Actualizador listo (${tamano} MB, ${minutos} min) ──`);
console.log(`\n   ${exe}\n`);
console.log("Envíaselo al cliente y que lo ejecute COMO ADMINISTRADOR en el servidor.");
console.log("No pide contraseñas: respalda, detiene, actualiza, migra y vuelve a");
console.log("arrancar. Si algo falla, deja la versión anterior funcionando.\n");
console.log(`Espera Node ${manifiesto.nodeVersion} y Prisma ${manifiesto.prismaVersion} en el servidor;`);
console.log("si no coinciden, se niega y pide el instalador completo.\n");
