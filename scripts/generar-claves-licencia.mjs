// Genera el par de claves para firmar licencias. SE EJECUTA UNA SOLA VEZ.
//
//   node scripts/generar-claves-licencia.mjs
//
// Produce:
//   claves-licencia/privada.pem  ← NUNCA sale de tu máquina, NUNCA se commitea
//   claves-licencia/publica.pem  ← se pega en lib/licencia/estado.ts
//
// Si pierdes la clave privada, las licencias ya emitidas siguen funcionando
// pero no puedes emitir ninguna nueva: habría que cambiar la clave pública en
// el código y reinstalar en todos los clientes. Guárdala como guardas una
// contraseña maestra: copia cifrada y fuera de este equipo.

import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const carpeta = join(root, "claves-licencia");

if (existsSync(join(carpeta, "privada.pem"))) {
  console.error(
    "Ya existe claves-licencia/privada.pem.\n" +
      "Si generas otras, TODAS las licencias emitidas dejan de valer.\n" +
      "Borra el archivo a mano solo si sabes lo que estás haciendo."
  );
  process.exit(1);
}

// Ed25519: firmas cortas, rápidas y sin parámetros que elegir mal.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");

mkdirSync(carpeta, { recursive: true });
const privadaPem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicaPem = publicKey.export({ type: "spki", format: "pem" });

writeFileSync(join(carpeta, "privada.pem"), privadaPem, { mode: 0o600 });
writeFileSync(join(carpeta, "publica.pem"), publicaPem);

console.log("✓ Claves generadas en claves-licencia/\n");
console.log("1. GUARDA claves-licencia/privada.pem en un lugar seguro y fuera de este equipo.");
console.log("   Está en .gitignore: no se commitea nunca.\n");
console.log("2. Pega esta clave pública en lib/licencia/estado.ts,");
console.log("   en la constante CLAVE_PUBLICA_POR_DEFECTO:\n");
console.log(String(publicaPem).trim());
