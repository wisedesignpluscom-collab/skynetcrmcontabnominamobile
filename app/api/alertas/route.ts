import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canApprove } from "@/lib/permissions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const staleLimit = new Date(now.getTime() - 14 * 86400000);

  const [overdueTasks, dueFollowUps, staleDeals] = await Promise.all([
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
    aprobaciones: pendingApprovals.map((d) => ({
      id: d.id,
      titulo: d.title,
      tipo: d.pendingAction === "discount" ? "Descuento" : "Pérdida",
      solicitante: d.pendingBy?.name ?? "vendedor",
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
