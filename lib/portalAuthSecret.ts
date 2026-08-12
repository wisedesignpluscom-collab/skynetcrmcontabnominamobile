// Clave secreta para firmar/verificar las sesiones del portal de clientes.
// Deliberadamente SEPARADA de lib/authSecret.ts (la del CRM interno): así un
// token de un sistema nunca sirve para autenticarse en el otro, ni siquiera si
// alguno de los dos secretos se filtra. Mismo patrón de validación estricta
// (falla en vez de firmar con una clave débil o vacía). Válido en runtime Node
// y Edge (solo usa process.env + TextEncoder).

const MIN_LENGTH = 32;

let cached: Uint8Array | null = null;

export function getPortalAuthSecret(): Uint8Array {
  if (cached) return cached;
  const secret = process.env.PORTAL_AUTH_SECRET;
  if (!secret || secret.length < MIN_LENGTH) {
    throw new Error(
      `PORTAL_AUTH_SECRET ausente o demasiado corto (mínimo ${MIN_LENGTH} caracteres). ` +
        "Genera uno seguro con: openssl rand -hex 32"
    );
  }
  cached = new TextEncoder().encode(secret);
  return cached;
}

// Algoritmo único aceptado (evita ataques de confusión de algoritmo en jose)
export const PORTAL_JWT_ALG = "HS256" as const;
