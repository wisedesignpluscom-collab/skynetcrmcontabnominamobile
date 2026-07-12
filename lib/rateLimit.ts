// Limitador de tasa en memoria (proceso único: instalación de una sola empresa).
// Ventana deslizante simple por clave. Sirve para frenar fuerza bruta en el login
// sin infraestructura externa. No es un limitador distribuido; en un despliegue
// multi-proceso convendría Redis, pero para este caso es suficiente.

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

// Prune ocasional para que el mapa no crezca sin control
function prune(now: number) {
  if (store.size < 500) return;
  for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
}

export type RateResult = { allowed: boolean; retryAfterSec: number };

export function checkRateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  prune(now);
  const e = store.get(key);
  if (!e || e.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (e.count >= max) {
    return { allowed: false, retryAfterSec: Math.ceil((e.resetAt - now) / 1000) };
  }
  e.count++;
  return { allowed: true, retryAfterSec: 0 };
}

// Limpia el contador de una clave (ej. tras un login exitoso)
export function resetRateLimit(key: string): void {
  store.delete(key);
}
