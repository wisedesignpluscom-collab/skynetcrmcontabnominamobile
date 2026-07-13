// Health Score del cliente (posventa).
// Combina señales que ya existen (satisfacción, puntualidad de contacto, recencia
// de interacción, tareas al día y antigüedad) en un puntaje 0-100 + semáforo, con
// desglose por factor y motivos legibles. Los pesos/umbrales viven aquí (después,
// configurables).

import { prisma } from "@/lib/prisma";
import type { FollowUp } from "@prisma/client";

export type HealthBand = "verde" | "amarillo" | "rojo";

// Un factor del puntaje: cuánto aportó (points de max) y una nota legible.
// `concern` = true cuando está penalizado (arrastra la salud hacia abajo).
export type HealthFactor = {
  key: string;
  label: string;
  points: number;
  max: number;
  note: string;
  concern: boolean;
};

export type HealthResult = {
  score: number;
  band: HealthBand;
  reasons: string[];
  factors: HealthFactor[];
};

export type HealthInput = {
  satisfaction: number | null;
  nextContactDate: Date | null;
  lastActivityAt: Date | null;
  overdueTasks: number;
  clientSince: Date;
  now?: Date;
};

const DAY = 86_400_000;
const days = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);

// Umbrales de banda (score → color)
export const HEALTH_THRESHOLDS = { verde: 70, amarillo: 45 };

export function bandOf(score: number): HealthBand {
  if (score >= HEALTH_THRESHOLDS.verde) return "verde";
  if (score >= HEALTH_THRESHOLDS.amarillo) return "amarillo";
  return "rojo";
}

// Fórmula pura (0-100) con desglose por factor.
export function computeHealth(input: HealthInput): HealthResult {
  const now = input.now ?? new Date();
  const factors: HealthFactor[] = [];

  // 1) Satisfacción (0-35)
  {
    const sat = input.satisfaction;
    let points = 18;
    let note = "Sin encuesta de satisfacción";
    let concern = true;
    if (sat != null) {
      points = ({ 5: 35, 4: 28, 3: 18, 2: 8, 1: 0 } as Record<number, number>)[sat] ?? 18;
      if (sat <= 2) {
        note = `Satisfacción baja (${sat}/5)`;
        concern = true;
      } else if (sat === 3) {
        note = "Satisfacción neutra (3/5)";
        concern = true;
      } else {
        note = `Satisfacción ${sat}/5`;
        concern = false;
      }
    }
    factors.push({ key: "satisfaccion", label: "Satisfacción", points, max: 35, note, concern });
  }

  // 2) Puntualidad de contacto (0-25)
  {
    const ncd = input.nextContactDate;
    let points = 12;
    let note = "Sin próximo contacto programado";
    let concern = true;
    if (ncd) {
      const overdue = days(ncd, now);
      if (overdue <= 0) {
        points = 25;
        note = "Contacto al día";
        concern = false;
      } else if (overdue <= 7) {
        points = 15;
        note = `Contacto vencido hace ${overdue} día${overdue === 1 ? "" : "s"}`;
      } else if (overdue <= 30) {
        points = 7;
        note = `Contacto vencido hace ${overdue} días`;
      } else {
        points = 0;
        note = "Contacto vencido hace más de 30 días";
      }
    }
    factors.push({ key: "contacto", label: "Puntualidad de contacto", points, max: 25, note, concern });
  }

  // 3) Recencia de interacción (0-20)
  {
    const la = input.lastActivityAt;
    let points = 8;
    let note = "Sin interacciones registradas";
    let concern = true;
    if (la) {
      const d = days(la, now);
      if (d <= 30) {
        points = 20;
        note = "Interacción reciente";
        concern = false;
      } else if (d <= 60) {
        points = 12;
        note = `Última interacción hace ${d} días`;
      } else if (d <= 90) {
        points = 5;
        note = `Sin interacción hace ${d} días`;
      } else {
        points = 0;
        note = "Sin interacción hace más de 90 días";
      }
    }
    factors.push({ key: "recencia", label: "Recencia de interacción", points, max: 20, note, concern });
  }

  // 4) Tareas al día (0-12)
  {
    let points = 12;
    let note = "Sin tareas vencidas";
    let concern = false;
    if (input.overdueTasks === 1) {
      points = 6;
      note = "1 tarea vencida";
      concern = true;
    } else if (input.overdueTasks >= 2) {
      points = 0;
      note = `${input.overdueTasks} tareas vencidas`;
      concern = true;
    }
    factors.push({ key: "tareas", label: "Tareas al día", points, max: 12, note, concern });
  }

  // 5) Lealtad / antigüedad (0-8) — bonus, nunca es un "problema"
  {
    const months = (now.getTime() - input.clientSince.getTime()) / (30 * DAY);
    let points = 1;
    let note = "Cliente nuevo";
    if (months >= 12) {
      points = 8;
      note = "Más de 1 año como cliente";
    } else if (months >= 6) {
      points = 5;
      note = "Más de 6 meses como cliente";
    } else if (months >= 3) {
      points = 3;
      note = "Más de 3 meses como cliente";
    }
    factors.push({ key: "antiguedad", label: "Lealtad (antigüedad)", points, max: 8, note, concern: false });
  }

  const score = Math.max(
    0,
    Math.min(100, Math.round(factors.reduce((s, f) => s + f.points, 0)))
  );
  const reasons = factors.filter((f) => f.concern).map((f) => f.note);
  return { score, band: bandOf(score), reasons, factors };
}

// Reúne las señales de la base para un FollowUp.
async function gatherInput(fu: FollowUp): Promise<HealthInput> {
  const now = new Date();
  const [lastActivity, overdueTasks] = await Promise.all([
    prisma.activity.findFirst({
      where: { OR: [{ contactId: fu.contactId }, { dealId: fu.dealId }] },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.task.count({
      where: {
        done: false,
        dueDate: { lt: now },
        OR: [{ contactId: fu.contactId }, { dealId: fu.dealId }],
      },
    }),
  ]);
  return {
    satisfaction: fu.satisfaction,
    nextContactDate: fu.nextContactDate,
    lastActivityAt: lastActivity?.createdAt ?? null,
    overdueTasks,
    clientSince: fu.createdAt,
    now,
  };
}

// Calcula la salud SIN escribir (para mostrar el desglose siempre fresco).
export async function getHealth(followUpId: string): Promise<HealthResult | null> {
  const fu = await prisma.followUp.findUnique({ where: { id: followUpId } });
  if (!fu) return null;
  return computeHealth(await gatherInput(fu));
}

// Playbook de rescate: cuando un cliente CAE a rojo, crea una tarea asignada al
// supervisor + un aviso de campanita. Se salta si ya hay una tarea de "riesgo"
// abierta para ese contacto (evita duplicar con la regla riesgo_auto por
// satisfacción ≤2).
const RESCUE_PREFIX = "Rescatar cliente en riesgo: ";

async function triggerRiskPlaybook(fu: FollowUp, reasons: string[]): Promise<void> {
  const existing = await prisma.task.findFirst({
    where: {
      done: false,
      contactId: fu.contactId,
      title: { contains: "riesgo" },
    },
    select: { id: true },
  });
  if (existing) return; // ya hay una tarea de riesgo abierta

  const contact = await prisma.contact.findUnique({
    where: { id: fu.contactId },
    select: { firstName: true, lastName: true },
  });
  if (!contact) return;
  const name = `${contact.firstName} ${contact.lastName}`;

  // A quién se asigna: primer supervisor (o admin) del sistema
  const supervisor = await prisma.user.findFirst({
    where: { role: { in: ["supervisor", "admin"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const detalle = reasons.length ? reasons.join(" · ") : "Salud del cliente cayó a riesgo.";

  await prisma.task.create({
    data: {
      title: `${RESCUE_PREFIX}${name}`,
      description: `Motivos: ${detalle}`,
      type: "Llamada",
      dueDate: new Date(),
      ownerId: supervisor?.id ?? null,
      contactId: fu.contactId,
      dealId: fu.dealId,
    },
  });
  await prisma.notification.create({
    data: {
      title: `🔴 Cliente en riesgo: ${name}`,
      body: detalle,
      url: `/contactos/${fu.contactId}`,
    },
  });
  await prisma.activity.create({
    data: {
      type: "sistema",
      content: `Automatización: la salud del cliente cayó a RIESGO — tarea de rescate creada${
        supervisor ? " para el supervisor" : ""
      }.`,
      contactId: fu.contactId,
      dealId: fu.dealId,
    },
  });
}

// Calcula y GUARDA la salud (cache para ordenar/filtrar la cartera).
export async function recomputeHealth(followUpId: string): Promise<HealthResult | null> {
  const fu = await prisma.followUp.findUnique({ where: { id: followUpId } });
  if (!fu) return null;
  const oldBand = fu.healthBand;
  const result = computeHealth(await gatherInput(fu));
  await prisma.followUp.update({
    where: { id: followUpId },
    data: {
      healthScore: result.score,
      healthBand: result.band,
      healthReasons: JSON.stringify(result.reasons),
      healthComputedAt: new Date(),
    },
  });

  // Transición a rojo → dispara el playbook de rescate (sin romper el recálculo)
  if (result.band === "rojo" && oldBand !== "rojo") {
    try {
      await triggerRiskPlaybook(fu, result.reasons);
    } catch (e) {
      console.error("[health] playbook de rescate:", e);
    }
  }

  return result;
}

// Recalcula toda la cartera (barrido diario y backfill inicial).
export async function recomputeAllHealth(): Promise<number> {
  const ids = await prisma.followUp.findMany({ select: { id: true } });
  for (const { id } of ids) await recomputeHealth(id);
  return ids.length;
}
