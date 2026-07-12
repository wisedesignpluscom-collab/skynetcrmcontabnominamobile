// Defensa contra SSRF: valida que una URL (ej. la de un webhook de automatización)
// apunte a un destino público y no a la red interna, loopback o metadata del cloud
// (169.254.169.254). Se puede desactivar con ALLOW_INTERNAL_WEBHOOKS=true si el
// despacho tiene un webhook interno legítimo.

import { lookup } from "node:dns/promises";
import net from "node:net";

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true; // this-host, privada, loopback
  if (a === 169 && b === 254) return true; // link-local + metadata (AWS/GCP/Azure)
  if (a === 172 && b >= 16 && b <= 31) return true; // privada
  if (a === 192 && b === 168) return true; // privada
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === "::1" || x === "::") return true;
  if (x.startsWith("fc") || x.startsWith("fd")) return true; // ULA (fc00::/7)
  if (x.startsWith("fe80")) return true; // link-local
  if (x.startsWith("::ffff:")) return isPrivateIPv4(x.split(":").pop() ?? ""); // IPv4-mapeada
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true; // no es IP reconocible → bloquear por precaución
}

// Lanza si la URL no es segura para llamar desde el servidor.
export async function assertPublicUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("URL inválida");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Solo se permiten URLs http(s)");
  }

  if (process.env.ALLOW_INTERNAL_WEBHOOKS === "true") return; // opt-out explícito

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Destino interno bloqueado");
  }
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("IP privada/interna bloqueada");
    return;
  }
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0) throw new Error("No se pudo resolver el host");
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) throw new Error("El host resuelve a una IP interna");
  }
}
