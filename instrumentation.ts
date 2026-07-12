// Next.js ejecuta register() una vez al iniciar el servidor. Lo usamos para
// arrancar el planificador de fondo (envío de correo programado + cola del
// motor) solo en el runtime de Node (no en Edge ni en el build).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startEngineScheduler } = await import("@/lib/email/scheduler");
  startEngineScheduler();
}
