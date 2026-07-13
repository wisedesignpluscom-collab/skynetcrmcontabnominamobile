// Next.js ejecuta register() una vez al iniciar el servidor. Lo usamos para
// arrancar el planificador de fondo (envío de correo programado + cola del
// motor) solo en el runtime de Node (no en Edge ni en el build).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // En serverless (Vercel) las funciones se congelan entre peticiones: el
  // setInterval no persiste. Allí el trabajo de fondo lo dispara /api/cron
  // (cron externo o Vercel Cron). Solo arrancamos el planificador persistente
  // en despliegues on-premise / servidor propio.
  if (process.env.VERCEL) return;
  const { startEngineScheduler } = await import("@/lib/email/scheduler");
  startEngineScheduler();
}
