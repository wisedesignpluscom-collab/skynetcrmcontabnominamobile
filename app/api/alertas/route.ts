import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canApprove } from "@/lib/permissions";
import { runSweeps } from "@/lib/automations";
import { runEngineTick } from "@/lib/engine/queue";
import { sendPendingEmails } from "@/lib/email/mailer";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  // Defensa en profundidad: además del middleware, no devolver datos del CRM
  // (ni disparar el motor) sin una sesión válida.
  if (!session) return NextResponse.json({ error: "no autenticado" }, { status: 401 });

  // Barridos de automatización: se disparan con el uso normal del sistema
  // (como mucho una vez cada 6 horas); nunca deben tumbar las alertas.
  try {
    await runSweeps();
  } catch {}
  // Workflow Engine: procesa la cola (esperas y reintentos vencidos) y, como
  // mucho una vez por hora, los triggers de tiempo.
  try {
    await runEngineTick();
  } catch {}
  // Envía los correos programados cuya hora ya llegó (además del planificador de fondo)
  try {
    await sendPendingEmails();
  } catch {}

  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const staleLimit = new Date(now.getTime() - 14 * 86400000);

  const [overdueTasks, dueFollowUps, staleDeals, avisos] = await Promise.all([
    prisma.task.findMany({
      where: { done: false, dueDate: { lt: now } },
      include: { contact: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.followUp.findMany({
      where: { nextContactDate: { lte: todayEnd } },
      include: { contact: true, deal: true },
      orderBy: { nextContactDate: "asc" },
      take: 5,
    }),
    prisma.deal.findMany({
      where: { status: "open", updatedAt: { lt: staleLimit } },
      include: { contact: true },
      orderBy: { updatedAt: "asc" },
      take: 5,
    }),
    // Avisos de workflows (acción «enviar_notificacion») sin leer
    prisma.notification.findMany({
      where: { readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  // Solicitudes pendientes: solo para quienes pueden aprobar
  const pendingApprovals = canApprove(session?.role)
    ? await prisma.deal.findMany({
        where: { pendingAction: { not: null } },
        include: { pendingBy: true },
        orderBy: { pendingAt: "asc" },
        take: 5,
      })
    : [];

  return NextResponse.json({
    avisos: avisos.map((n) => ({
      id: n.id,
      titulo: n.title,
      cuerpo: n.body,
      url: n.url,
    })),
    aprobaciones: pendingApprovals.map((d) => ({
      id: d.id,
      titulo: d.title,
      tipo: d.pendingAction === "discount" ? "Descuento" : "Pérdida",
      solicitante: d.pendingBy?.name ?? "un analista",
    })),
    tareas: overdueTasks.map((t) => ({
      id: t.id,
      titulo: t.title,
      contacto: t.contact ? `${t.contact.firstName} ${t.contact.lastName}` : null,
    })),
    posventa: dueFollowUps.map((f) => ({
      id: f.id,
      cliente: `${f.contact.firstName} ${f.contact.lastName}`,
      negocio: f.deal.title,
    })),
    estancadas: staleDeals.map((d) => ({
      id: d.id,
      titulo: d.title,
      dias: Math.floor((now.getTime() - d.updatedAt.getTime()) / 86400000),
    })),
  });
}

// Marca un aviso de workflow como leído (al hacer clic en la campanita)
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { avisoId } = await request.json().catch(() => ({ avisoId: null }));
  if (typeof avisoId !== "string" || !avisoId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await prisma.notification.updateMany({
    where: { id: avisoId, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
