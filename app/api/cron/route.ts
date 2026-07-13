// Endpoint del planificador para entornos serverless (Vercel). En on-premise el
// trabajo lo hace el planificador de fondo (instrumentation.ts); en la nube las
// funciones se congelan entre peticiones, así que un cron EXTERNO (o Vercel Cron)
// debe golpear esta ruta cada minuto para:
//   - procesar la cola del Workflow Engine (esperas, reintentos, triggers de tiempo)
//   - enviar los correos programados cuya hora ya llegó
//   - correr los barridos de automatización
//
// Protegido por CRON_SECRET (no usa sesión). Se acepta el secreto por:
//   - cabecera  Authorization: Bearer <CRON_SECRET>   (lo envía Vercel Cron)
//   - query     ?key=<CRON_SECRET>                     (para cron-job.org u otros)
// La ruta está exenta del middleware de sesión (ver proxy.ts).

import { NextResponse } from "next/server";
import { runSweeps } from "@/lib/automations";
import { runEngineTick } from "@/lib/engine/queue";
import { sendPendingEmails } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";
// Node runtime (Prisma no corre en Edge)
export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secreto configurado, no se autoriza nada
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const key = new URL(req.url).searchParams.get("key");
  return key === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const result: { engine?: string; email?: { sent: number; failed: number }; sweeps?: string } = {};

  try {
    await runSweeps();
    result.sweeps = "ok";
  } catch (e) {
    result.sweeps = e instanceof Error ? e.message : "error";
  }
  try {
    await runEngineTick();
    result.engine = "ok";
  } catch (e) {
    result.engine = e instanceof Error ? e.message : "error";
  }
  try {
    result.email = await sendPendingEmails();
  } catch {
    result.email = { sent: 0, failed: 0 };
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...result });
}
