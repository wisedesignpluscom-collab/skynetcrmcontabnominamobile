// Clave secreta para firmar/verificar las sesiones. Se valida SIEMPRE: si falta o
// es demasiado corta, la app falla en vez de firmar tokens con una clave débil o
// vacía (que un atacante podría adivinar/forjar). Compartida por session.ts y
// proxy.ts (middleware). Válido en runtime Node y Edge (solo usa process.env +
// TextEncoder).

const MIN_LENGTH = 32;

let cached: Uint8Array | null = null;

export function getAuthSecret(): Uint8Array {
  if (cached) return cached;
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < MIN_LENGTH) {
    throw new Error(
      `AUTH_SECRET ausente o demasiado corto (mínimo ${MIN_LENGTH} caracteres). ` +
        "Genera uno seguro con: openssl rand -hex 32"
    );
  }
  cached = new TextEncoder().encode(secret);
  return cached;
}

// Algoritmo único aceptado (evita ataques de confusión de algoritmo en jose)
export const JWT_ALG = "HS256" as const;
