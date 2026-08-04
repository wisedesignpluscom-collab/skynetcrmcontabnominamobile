// Genera SkynetCRM-Setup.exe desde este mismo equipo (macOS o Linux).
//
//   npm run instalador
//
// No hace falta Windows: NSIS compila instaladores de Windows en cualquier
// sistema. Antes hay que haber corrido `npm run empaquetar`, que es quien deja
// dist/windows/ con la aplicación, Node y PostgreSQL.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist", "windows");
const guion = join(root, "instalador", "skynet-crm.nsi");
const salida = join(root, "instalador", "salida");
const exe = join(salida, "SkynetCRM-Setup.exe");

const paso = (t) => console.log(`\n== ${t}`);
const ok = (t) => console.log(`   ✓ ${t}`);

function morir(titulo, ...detalle) {
  console.error(`\n✗ ${titulo}\n`);
  for (const linea of detalle) console.error(`  ${linea}`);
  console.error("");
  process.exit(1);
}

// ── 1. ¿Está el paquete? ────────────────────────────────────────────────────
paso("Revisando el paquete");

// Lo que el guion .nsi mete en el .exe. Si falta algo aquí, NSIS aborta con un
// error de ruta que no orienta; es mejor decirlo antes y en español.
const obligatorios = [
  ["app", "la aplicación compilada"],
  ["node", "el runtime de Node para Windows"],
  ["postgres", "los binarios de PostgreSQL para Windows"],
  ["prisma", "el esquema y las migraciones"],
  ["node_modules", "Prisma CLI para aplicar las migraciones"],
  ["semillas", "los datos iniciales"],
  ["instalador", "los scripts de configuración"],
  ["vc_redist.x64.exe", "el runtime de Visual C++ que necesita PostgreSQL"],
  ["version.json", "el manifiesto de versión"],
  ["skynet.ico", "el icono"],
  ["iniciar-servidor.cmd", "el lanzador del servidor"],
];

if (!existsSync(dist)) {
  morir(
    "No existe dist/windows: falta empaquetar.",
    "Corre primero:   npm run empaquetar"
  );
}
const faltan = obligatorios.filter(([n]) => !existsSync(join(dist, n)));
if (faltan.length > 0) {
  morir(
    "El paquete está incompleto.",
    "Falta en dist/windows:",
    ...faltan.map(([n, q]) => `  · ${n}  (${q})`),
    "",
    "Vuelve a correr:   npm run empaquetar"
  );
}

// El binario nativo de macOS dentro del paquete de Windows no da error al
// compilar, pero rompe la aplicación en el servidor del cliente. Se comprueba
// aquí porque es un fallo silencioso y caro de diagnosticar allá.
const platAjena = ["sharp-darwin-x64", "sharp-linux-x64", "sharp-libvips-darwin-x64"];
const modulos = join(dist, "app", "node_modules", "@img");
if (existsSync(modulos)) {
  morir(
    "El paquete lleva binarios nativos que no son de Windows.",
    `Se encontró ${modulos}`,
    `(${platAjena.join(", ")} y similares no cargan en Windows)`,
    "",
    "Vuelve a correr:   npm run empaquetar"
  );
}
ok("dist/windows completo y sin binarios de otra plataforma");

if (!existsSync(join(root, "instalador", "recursos", "skynet.ico"))) {
  morir("Falta instalador/recursos/skynet.ico.", "Corre:   npm run empaquetar");
}

// ── 2. ¿Está NSIS? ──────────────────────────────────────────────────────────
paso("Revisando NSIS");

let version;
try {
  version = execFileSync("makensis", ["-VERSION"], { encoding: "utf8" }).trim();
} catch {
  morir(
    "No está instalado makensis (NSIS), que es quien genera el .exe.",
    "En macOS:   brew install makensis",
    "En Linux:   sudo apt install nsis",
    "",
    "NSIS compila instaladores de Windows desde macOS o Linux;",
    "por eso ya no hace falta una máquina Windows para este paso."
  );
}
ok(`makensis ${version}`);

// ── 3. Compilar ─────────────────────────────────────────────────────────────
mkdirSync(salida, { recursive: true });

const paquete = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifiesto = JSON.parse(readFileSync(join(dist, "version.json"), "utf8"));

paso(`Compilando el instalador (versión ${manifiesto.version || paquete.version})`);
console.log("   Son unos 450 MB a comprimir: tarda varios minutos.\n");

const inicio = Date.now();
try {
  execFileSync(
    "makensis",
    [
      "-V2",
      // Los mensajes del asistente llevan acentos: el guion es UTF-8.
      "-INPUTCHARSET", "UTF8",
      `-DVERSION=${manifiesto.version || paquete.version}`,
      guion,
    ],
    { cwd: join(root, "instalador"), stdio: "inherit" }
  );
} catch {
  morir(
    "NSIS no pudo generar el instalador.",
    "El detalle está justo arriba, en la salida de makensis."
  );
}

if (!existsSync(exe)) {
  morir("makensis terminó pero no dejó el .exe.", `Se esperaba en ${exe}`);
}

const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
const tamano = (statSync(exe).size / 1024 / 1024).toFixed(0);

console.log(`\n── Instalador listo (${tamano} MB, ${minutos} min) ──`);
console.log(`\n   ${exe}\n`);
console.log("Cópialo al servidor Windows del cliente y ejecútalo como administrador.");
console.log("El asistente pide puertos, contraseñas y carpeta de datos, y deja el");
console.log("sistema funcionando. No hay que instalar Docker, Node ni PostgreSQL:");
console.log("van dentro del .exe.\n");
