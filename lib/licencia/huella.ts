// Huella del equipo donde corre el sistema (server-only).
//
// Se leen tres identificadores del hardware. Ninguno es infalible por separado
// —una placa clonada, un disco reemplazado— pero exigir 2 de 3 (ver licencia.ts)
// da el equilibrio que hace falta: copiar la carpeta a otra máquina falla, y
// cambiar una pieza no deja a la firma sin sistema.
//
// En Windows se leen con PowerShell (CIM). En macOS y Linux hay equivalentes
// para poder desarrollar y probar sin un Windows delante.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { networkInterfaces, platform } from "node:os";
import type { Huella } from "./licencia";

function correr(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function ps(consulta: string): string {
  return correr("powershell", ["-NoProfile", "-NonInteractive", "-Command", consulta]);
}

// MAC de la primera interfaz física con dirección propia. Se ordena por nombre
// para que el resultado no dependa del orden en que el sistema las enumere.
function macPrincipal(): string {
  const interfaces = networkInterfaces();
  const candidatas: string[] = [];
  for (const nombre of Object.keys(interfaces).sort()) {
    for (const i of interfaces[nombre] ?? []) {
      if (!i.internal && i.mac && i.mac !== "00:00:00:00:00:00") candidatas.push(i.mac);
    }
  }
  return candidatas[0] ?? "";
}

function huellaWindows(): Huella {
  return {
    placa: ps("(Get-CimInstance Win32_ComputerSystemProduct).UUID"),
    disco: ps(
      "(Get-CimInstance Win32_DiskDrive | Sort-Object DeviceID | Select-Object -First 1).SerialNumber"
    ),
    red: macPrincipal(),
  };
}

function huellaMac(): Huella {
  const serie = correr("sh", [
    "-c",
    "ioreg -l | grep IOPlatformSerialNumber | head -1 | awk -F'\"' '{print $4}'",
  ]);
  const uuid = correr("sh", [
    "-c",
    "ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID | awk -F'\"' '{print $4}'",
  ]);
  return { placa: uuid, disco: serie, red: macPrincipal() };
}

function huellaLinux(): Huella {
  return {
    placa: correr("sh", ["-c", "cat /sys/class/dmi/id/product_uuid 2>/dev/null || cat /etc/machine-id"]),
    disco: correr("sh", ["-c", "lsblk -ndo SERIAL 2>/dev/null | head -1"]),
    red: macPrincipal(),
  };
}

let cacheHuella: Huella | null = null;

// Leer el hardware cuesta (PowerShell tarda ~1 s), así que se cachea: el
// hardware no cambia mientras el proceso vive.
export function huellaDelEquipo(): Huella {
  if (cacheHuella) return cacheHuella;
  const so = platform();
  cacheHuella =
    so === "win32" ? huellaWindows() : so === "darwin" ? huellaMac() : huellaLinux();
  return cacheHuella;
}

// Código corto y legible que el técnico le dicta o envía al proveedor para que
// emita la licencia. No es secreto: identifica el equipo, no da acceso a nada.
export function codigoDeEquipo(huella: Huella = huellaDelEquipo()): string {
  const base = `${huella.placa}|${huella.disco}|${huella.red}`.toUpperCase();
  const hash = createHash("sha256").update(base).digest("hex").toUpperCase();
  // Cuatro grupos de cuatro: fácil de leer por teléfono y de teclear
  return (hash.slice(0, 16).match(/.{4}/g) ?? []).join("-");
}

// Solo para diagnóstico: no se muestra en la interfaz de los usuarios.
export function detalleHuella(): Huella & { codigo: string } {
  const h = huellaDelEquipo();
  return { ...h, codigo: codigoDeEquipo(h) };
}
