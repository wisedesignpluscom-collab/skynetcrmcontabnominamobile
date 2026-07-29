// Estado de la licencia en esta instalación (server-only): lee el archivo,
// verifica y cachea el resultado.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluarLicencia, type Resultado } from "./licencia";
import { huellaDelEquipo } from "./huella";

// Clave PÚBLICA del proveedor. Solo sirve para verificar: con ella no se pueden
// emitir licencias. La privada vive únicamente en la máquina del proveedor
// (ver scripts/generar-claves-licencia.mjs).
//
// Se puede sustituir por la variable LICENCIA_CLAVE_PUBLICA para poder probar
// con claves de desarrollo sin tocar el código.
const CLAVE_PUBLICA_POR_DEFECTO = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAvX08BSDg7lK0jNVirxH6jzRknkIUsCM3Rp8Pr1S9HrM=
-----END PUBLIC KEY-----`;

function clavePublica(): string {
  return process.env.LICENCIA_CLAVE_PUBLICA?.trim() || CLAVE_PUBLICA_POR_DEFECTO;
}

// Raíz de la instalación: donde el instalador deja licencia.lic
function raiz(): string {
  return process.env.SKYNET_RAIZ || process.cwd();
}

function rutaLicencia(): string {
  return process.env.LICENCIA_ARCHIVO || join(raiz(), "licencia.lic");
}

// Marca con la fecha de instalación. De aquí se cuentan los días de gracia
// mientras no haya licencia. Si no existe, se crea con la fecha de hoy: una
// instalación recién hecha arranca con la gracia completa.
function instaladoEl(): Date {
  const marca = join(raiz(), "config", "instalado.txt");
  try {
    if (existsSync(marca)) {
      const t = readFileSync(marca, "utf8").trim();
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) return d;
    }
    writeFileSync(marca, new Date().toISOString(), "utf8");
  } catch {
    // Sin permisos de escritura: se usa la fecha del propio archivo del sistema
    try {
      return statSync(join(raiz(), "app", "server.js")).mtime;
    } catch {
      /* nada más que intentar */
    }
  }
  return new Date();
}

let cache: { resultado: Resultado; hasta: number } | null = null;
// La licencia se revisa cada 10 minutos: basta para reaccionar a un archivo
// nuevo sin leer el disco en cada petición.
const TTL_MS = 10 * 60 * 1000;

export function estadoLicencia(forzar = false): Resultado {
  if (!forzar && cache && Date.now() < cache.hasta) return cache.resultado;

  let texto: string | null = null;
  try {
    const ruta = rutaLicencia();
    if (existsSync(ruta)) texto = readFileSync(ruta, "utf8");
  } catch {
    texto = null;
  }

  const resultado = evaluarLicencia({
    texto,
    huella: huellaDelEquipo(),
    clavePublicaPem: clavePublica(),
    instaladoEl: instaladoEl(),
  });

  cache = { resultado, hasta: Date.now() + TTL_MS };
  return resultado;
}

export function olvidarLicenciaCacheada() {
  cache = null;
}
