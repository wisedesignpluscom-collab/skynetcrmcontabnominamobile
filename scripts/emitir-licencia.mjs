// Emite una licencia para un cliente. Se ejecuta EN TU MÁQUINA, nunca se
// distribuye: necesita la clave privada.
//
//   node scripts/emitir-licencia.mjs \
//       --cliente "Firma Contable Wilmer C.A." \
//       --placa "4C4C4544-0037..." --disco "WD-WX21A..." --red "a4:bb:6d:..." \
//       [--expira 2027-12-31] [--referencia "Contrato 2026-014"]
//
// El técnico obtiene los tres valores del servidor con:
//   panel de la bandeja  ->  "Ver los datos del equipo (para la licencia)"
//
// Produce licencia.lic, que se copia a C:\SkynetCRM en el servidor del cliente.

import { createPrivateKey, sign } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const privadaPath = join(root, "claves-licencia", "privada.pem");

// Debe coincidir EXACTAMENTE con canonizar() de lib/licencia/licencia.ts
function canonizar(payload) {
  const h = payload.huella;
  return JSON.stringify({
    cliente: payload.cliente,
    emitida: payload.emitida,
    expira: payload.expira ?? null,
    huella: { disco: h.disco, placa: h.placa, red: h.red },
    referencia: payload.referencia ?? null,
  });
}

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (!existsSync(privadaPath)) {
  console.error(
    "No se encontró claves-licencia/privada.pem.\n" +
      "Genérala una sola vez con: node scripts/generar-claves-licencia.mjs"
  );
  process.exit(1);
}

const cliente = arg("cliente");
const placa = arg("placa") ?? "";
const disco = arg("disco") ?? "";
const red = arg("red") ?? "";
const expira = arg("expira");
const referencia = arg("referencia");
const salida = arg("salida") ?? join(root, "licencia.lic");

if (!cliente) {
  console.error('Falta --cliente "Nombre de la firma"');
  process.exit(1);
}

// Se exigen al menos dos componentes porque la verificación pide 2 de 3: con
// uno solo, la licencia nacería invlálida y el error aparecería en el cliente.
const presentes = [placa, disco, red].filter((v) => v.trim()).length;
if (presentes < 2) {
  console.error(
    "Hacen falta al menos dos de --placa, --disco y --red.\n" +
      "El sistema valida 2 de 3, así que con uno solo la licencia no serviría."
  );
  process.exit(1);
}
if (presentes < 3) {
  console.warn(
    "AVISO: solo se dieron dos componentes. La licencia funcionará, pero si el " +
      "cliente cambia una de esas dos piezas habrá que emitir otra."
  );
}

if (expira && Number.isNaN(new Date(expira).getTime())) {
  console.error("La fecha de --expira no es válida. Usa el formato 2027-12-31.");
  process.exit(1);
}

const payload = {
  cliente: cliente.trim(),
  huella: { placa: placa.trim(), disco: disco.trim(), red: red.trim() },
  emitida: new Date().toISOString(),
  ...(expira ? { expira: new Date(`${expira}T23:59:59`).toISOString() } : {}),
  ...(referencia ? { referencia: referencia.trim() } : {}),
};

const clave = createPrivateKey(readFileSync(privadaPath, "utf8"));
const firma = sign(null, Buffer.from(canonizar(payload), "utf8"), clave).toString("base64");

writeFileSync(salida, JSON.stringify({ payload, firma }, null, 2), "utf8");

console.log(`\n✓ Licencia emitida: ${salida}\n`);
console.log(`  Cliente:     ${payload.cliente}`);
console.log(`  Vigencia:    ${payload.expira ? `hasta ${expira}` : "perpetua"}`);
console.log(`  Componentes: ${presentes} de 3`);
if (referencia) console.log(`  Referencia:  ${payload.referencia}`);
console.log("\nEnvíala al cliente y que la copie en C:\\SkynetCRM\\licencia.lic");
console.log("Luego, reiniciar el sistema desde el panel de la bandeja.");
