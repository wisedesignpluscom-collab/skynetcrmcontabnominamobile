// Planificador de fondo para el servidor persistente (on-premise). Arranca una
// sola vez al iniciar el servidor (ver instrumentation.ts) y, cada minuto,
// procesa la cola del motor y envía los correos programados cuya hora llegó.
// Así las automatizaciones por tiempo y el correo planificado funcionan 24/7
// aunque nadie tenga el navegador abierto. En serverless (Netlify) el intervalo
// no persiste — allí el trabajo lo dispara el heartbeat de /api/alertas.

let started = false;

export function startEngineScheduler(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      const { runEngineTick } = await import("@/lib/engine/queue");
      await runEngineTick();
    } catch (e) {
      console.error("[scheduler] motor:", e);
    }
    try {
      const { sendPendingEmails } = await import("@/lib/email/mailer");
      const r = await sendPendingEmails();
      if (r.sent || r.failed) console.log(`[scheduler] correo: ${r.sent} enviados, ${r.failed} con error`);
    } catch (e) {
      console.error("[scheduler] correo:", e);
    }
  };

  // No bloquea el arranque; primer ciclo a los 15 s, luego cada minuto
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000);
  console.log("[scheduler] motor de fondo activo (cada 60 s)");
}
