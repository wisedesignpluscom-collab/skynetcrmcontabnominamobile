// Health Score del cliente (posventa).
// Combina señales que ya existen (satisfacción, puntualidad de contacto, recencia
// de interacción, tareas al día y antigüedad) en un puntaje 0-100 + semáforo, con
// desglose por factor y motivos. Los PESOS de cada factor y los UMBRALES de banda
// son configurables (AppSetting "health_config"; el admin los ajusta en /configuracion).

import { prisma } from "@/lib/prisma";
import type { FollowUp } from "@prisma/client";

export type HealthBand = "verde" | "amarillo" | "rojo";

export type HealthWeights = {
  satisfaccion: number;
  contacto: number;
  recencia: number;
  tareas: number;
  antiguedad: number;
};

export type HealthConfig = {
  weights: HealthWeights;
  thresholds: { verde: number; amarillo: number };
};

// Valores por defecto (los pesos suman 100).
export const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  weights: { satisfaccion: 35, contacto: 25, recencia: 20, tareas: 12, antiguedad: 8 },
  thresholds: { verde: 70, amarillo: 45 },
};

// Un factor del puntaje: cuánto aportó (points de max=peso) y una nota legible.
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

function bandOf(score: number, thresholds: HealthConfig["thresholds"]): HealthBand {
  if (score >= thresholds.verde) return "verde";
  if (score >= thresholds.amarillo) return "amarillo";
  return "rojo";
}

// Fórmula pura (0-100). Cada factor calcula un ratio 0-1 y aporta ratio×peso;
// el puntaje se normaliza a 100 sobre la suma de los pesos.
export function computeHealth(
  input: HealthInput,
  config: HealthConfig = DEFAULT_HEALTH_CONFIG
): HealthResult {
  const now = input.now ?? new Date();
  const w = config.weights;
  const factors: HealthFactor[] = [];
  let weighted = 0;

  const push = (
    key: string,
    label: string,
    weight: number,
    ratio: number,
    note: string,
    concern: boolean
  ) => {
    weighted += ratio * weight;
    factors.push({ key, label, points: Math.round(ratio * weight), max: weight, note, concern });
  };

  // 1) Satisfacción
  {
    const sat = input.satisfaction;
    let ratio = 18 / 35;
    let note = "Sin encuesta de satisfacción";
    let concern = true;
    if (sat != null) {
      ratio = ({ 5: 1, 4: 28 / 35, 3: 18 / 35, 2: 8 / 35, 1: 0 } as Record<number, number>)[sat] ?? 18 / 35;
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
    push("satisfaccion", "Satisfacción", w.satisfaccion, ratio, note, concern);
  }

  // 2) Puntualidad de contacto
  {
    const ncd = input.nextContactDate;
    let ratio = 12 / 25;
    let note = "Sin próximo contacto programado";
    let concern = true;
    if (ncd) {
      const overdue = days(ncd, now);
      if (overdue <= 0) {
        ratio = 1;
        note = "Contacto al día";
        concern = false;
      } else if (overdue <= 7) {
        ratio = 15 / 25;
        note = `Contacto vencido hace ${overdue} día${overdue === 1 ? "" : "s"}`;
      } else if (overdue <= 30) {
        ratio = 7 / 25;
        note = `Contacto vencido hace ${overdue} días`;
      } else {
        ratio = 0;
        note = "Contacto vencido hace más de 30 días";
      }
    }
    push("contacto", "Puntualidad de contacto", w.contacto, ratio, note, concern);
  }

  // 3) Recencia de interacción
  {
    const la = input.lastActivityAt;
    let ratio = 8 / 20;
    let note = "Sin interacciones registradas";
    let concern = true;
    if (la) {
      const d = days(la, now);
      if (d <= 30) {
        ratio = 1;
        note = "Interacción reciente";
        concern = false;
      } else if (d <= 60) {
        ratio = 12 / 20;
        note = `Última interacción hace ${d} días`;
      } else if (d <= 90) {
        ratio = 5 / 20;
        note = `Sin interacción hace ${d} días`;
      } else {
        ratio = 0;
        note = "Sin interacción hace más de 90 días";
      }
    }
    push("recencia", "Recencia de interacción", w.recencia, ratio, note, concern);
  }

  // 4) Tareas al día
  {
    let ratio = 1;
    let note = "Sin tareas vencidas";
    let concern = false;
    if (input.overdueTasks === 1) {
      ratio = 0.5;
      note = "1 tarea vencida";
      concern = true;
    } else if (input.overdueTasks >= 2) {
      ratio = 0;
      note = `${input.overdueTasks} tareas vencidas`;
      concern = true;
    }
    push("tareas", "Tareas al día", w.tareas, ratio, note, concern);
  }

  // 5) Lealtad / antigüedad — bonus, nunca es un "problema"
  {
    const months = (now.getTime() - input.clientSince.getTime()) / (30 * DAY);
    let ratio = 1 / 8;
    let note = "Cliente nuevo";
    if (months >= 12) {
      ratio = 1;
      note = "Más de 1 año como cliente";
    } else if (months >= 6) {
      ratio = 5 / 8;
      note = "Más de 6 meses como cliente";
    } else if (months >= 3) {
      ratio = 3 / 8;
      note = "Más de 3 meses como cliente";
    }
    push("antiguedad", "Lealtad (antigüedad)", w.antiguedad, ratio, note, false);
  }

  const totalWeight = w.satisfaccion + w.contacto + w.recencia + w.tareas + w.antiguedad;
  const score =
    totalWeight > 0 ? Math.max(0, Math.min(100, Math.round((weighted / totalWeight) * 100))) : 0;
  const reasons = factors.filter((f) => f.concern).map((f) => f.note);
  return { score, band: bandOf(score, config.thresholds), reasons, factors };
}

// ── Configuración (AppSetting "health_config") ──────────────────────────────
export async function getHealthConfig(): Promise<HealthConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: "health_config" } });
  if (!row) return DEFAULT_HEALTH_CONFIG;
  try {
    const c = JSON.parse(row.value) as Partial<HealthConfig>;
    return {
      weights: { ...DEFAULT_HEALTH_CONFIG.weights, ...(c.weights ?? {}) },
      thresholds: { ...DEFAULT_HEALTH_CONFIG.thresholds, ...(c.thresholds ?? {}) },
    };
  } catch {
    return DEFAULT_HEALTH_CONFIG;
  }
}

export async function saveHealthConfig(config: HealthConfig): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: "health_config" },
    update: { value: JSON.stringify(config) },
    create: { key: "health_config", value: JSON.stringify(config) },
  });
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
  return computeHealth(await gatherInput(fu), await getHealthConfig());
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
export async function recomputeHealth(
  followUpId: string,
  config?: HealthConfig
): Promise<HealthResult | null> {
  const fu = await prisma.followUp.findUnique({ where: { id: followUpId } });
  if (!fu) return null;
  const cfg = config ?? (await getHealthConfig());
  const oldBand = fu.healthBand;
  const result = computeHealth(await gatherInput(fu), cfg);
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

// Recalcula toda la cartera (barrido diario, backfill y al cambiar la config).
export async function recomputeAllHealth(): Promise<number> {
  const cfg = await getHealthConfig();
  const ids = await prisma.followUp.findMany({ select: { id: true } });
  for (const { id } of ids) await recomputeHealth(id, cfg);
  return ids.length;
}
