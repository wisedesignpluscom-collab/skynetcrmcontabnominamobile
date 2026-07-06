import { prisma } from "./prisma";

// ── Definición de las reglas de automatización ─────────────────────────────
// El admin las activa/desactiva y ajusta sus parámetros en /configuracion.

export const ruleDefs = [
  {
    key: "propuesta_seguimiento",
    title: "Seguimiento de propuestas",
    desc: "Al mover una oportunidad a una etapa de propuesta, crea automáticamente la tarea de seguimiento.",
    daysLabel: "Días de plazo para la tarea",
    days: 3,
    usesAmount: false,
  },
  {
    key: "leads_frios",
    title: "Rescate de leads fríos",
    desc: "Si un lead lleva demasiados días sin interacciones, crea una tarea para retomarlo.",
    daysLabel: "Días sin actividad",
    days: 15,
    usesAmount: false,
  },
  {
    key: "posventa_recurrente",
    title: "Posventa recurrente",
    desc: "Al registrar un contacto de posventa sin fecha próxima, la programa sola según la etapa (onboarding 7 días, seguimiento 30, fidelizado 90, en riesgo 7).",
    daysLabel: null,
    days: 0,
    usesAmount: false,
  },
  {
    key: "escalado_supervisor",
    title: "Escalado de negocios grandes",
    desc: "Oportunidad de alto valor sin movimiento: crea una tarea urgente de reactivación.",
    daysLabel: "Días sin movimiento",
    days: 14,
    usesAmount: true,
    amount: 5000,
  },
  {
    key: "riesgo_auto",
    title: "Cliente en riesgo automático",
    desc: "Una satisfacción de 1 o 2 estrellas mueve al cliente a «En riesgo» y crea una tarea urgente.",
    daysLabel: null,
    days: 0,
    usesAmount: false,
  },
] as const;

const SWEEP_KEY = "sweep_marker";
const SWEEP_INTERVAL_HOURS = 6;

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// Crea las filas de reglas que falten (con sus valores por defecto)
export async function ensureRules() {
  for (const r of ruleDefs) {
    await prisma.automationRule.upsert({
      where: { key: r.key },
      update: {},
      create: {
        key: r.key,
        enabled: true,
        days: r.days,
        amount: "amount" in r ? r.amount : null,
      },
    });
  }
}

function getRule(key: string) {
  return prisma.automationRule.findUnique({ where: { key } });
}

// ── Regla: seguimiento de propuestas ───────────────────────────────────────
// Se dispara cuando una oportunidad entra a una etapa cuyo nombre incluye "propuesta".
export async function onDealStageMoved(dealId: string, stageName: string) {
  const rule = await getRule("propuesta_seguimiento");
  if (!rule?.enabled) return;

  const norm = stageName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!norm.includes("propuesta")) return;

  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal || deal.status !== "open") return;

  const yaExiste = await prisma.task.findFirst({
    where: { dealId, done: false, title: { startsWith: "Seguimiento de propuesta" } },
  });
  if (yaExiste) return;

  await prisma.task.create({
    data: {
      title: `Seguimiento de propuesta: ${deal.title}`,
      type: "Seguimiento",
      dueDate: addDays(rule.days),
      contactId: deal.contactId,
      dealId,
    },
  });
  await prisma.activity.create({
    data: {
      type: "sistema",
      content: `Automatización: tarea de seguimiento de propuesta creada para dentro de ${rule.days} días.`,
      contactId: deal.contactId,
      dealId,
    },
  });
}

// ── Reglas de posventa: riesgo automático y recurrencia ────────────────────
export async function onFollowUpSaved(
  followUpId: string,
  opts: { hadNote: boolean; dateProvided: boolean }
) {
  const fu = await prisma.followUp.findUnique({
    where: { id: followUpId },
    include: { contact: true, deal: true },
  });
  if (!fu) return;

  // Satisfacción baja → el cliente pasa a "En riesgo" con tarea urgente
  const riesgo = await getRule("riesgo_auto");
  if (riesgo?.enabled && fu.satisfaction != null && fu.satisfaction <= 2 && fu.stage !== "riesgo") {
    await prisma.followUp.update({
      where: { id: fu.id },
      data: { stage: "riesgo", nextContactDate: addDays(1) },
    });
    await prisma.task.create({
      data: {
        title: `URGENTE: atender cliente en riesgo — ${fu.contact.firstName} ${fu.contact.lastName}`,
        type: "Llamada",
        dueDate: addDays(1),
        contactId: fu.contactId,
        dealId: fu.dealId,
      },
    });
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Automatización: satisfacción ${fu.satisfaction}/5 — el cliente pasó a «En riesgo» y se creó tarea urgente.`,
        contactId: fu.contactId,
        dealId: fu.dealId,
      },
    });
    return;
  }

  // Contacto registrado sin fecha próxima → se programa sola según la etapa
  const rec = await getRule("posventa_recurrente");
  if (rec?.enabled && opts.hadNote && !opts.dateProvided) {
    const intervalos: Record<string, number> = {
      onboarding: 7,
      seguimiento: 30,
      fidelizado: 90,
      riesgo: 7,
    };
    const dias = intervalos[fu.stage] ?? 30;
    await prisma.followUp.update({
      where: { id: fu.id },
      data: { nextContactDate: addDays(dias) },
    });
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Automatización: próximo contacto de posventa programado en ${dias} días (etapa ${fu.stage}).`,
        contactId: fu.contactId,
        dealId: fu.dealId,
      },
    });
  }
}

// ── Barridos periódicos ────────────────────────────────────────────────────
// Se disparan con el uso normal del sistema (desde la API de alertas),
// como mucho una vez cada SWEEP_INTERVAL_HOURS. No requiere procesos externos.
export async function runSweeps(force = false): Promise<boolean> {
  const marker = await prisma.automationRule.findUnique({ where: { key: SWEEP_KEY } });
  const now = Date.now();
  if (
    !force &&
    marker?.lastRunAt &&
    now - marker.lastRunAt.getTime() < SWEEP_INTERVAL_HOURS * 3600_000
  ) {
    return false;
  }
  await prisma.automationRule.upsert({
    where: { key: SWEEP_KEY },
    update: { lastRunAt: new Date() },
    create: { key: SWEEP_KEY, enabled: true, days: 0, lastRunAt: new Date() },
  });

  // Leads fríos: sin interacciones en N días → tarea de rescate
  const frios = await getRule("leads_frios");
  if (frios?.enabled) {
    const limite = addDays(-frios.days);
    const leads = await prisma.contact.findMany({
      where: { status: "lead", createdAt: { lt: limite } },
      include: {
        activities: { orderBy: { createdAt: "desc" }, take: 1 },
        tasks: { where: { done: false } },
      },
    });
    for (const c of leads) {
      const ultima = c.activities[0]?.createdAt ?? c.createdAt;
      if (ultima > limite) continue;
      if (c.tasks.some((t) => t.title.startsWith("Retomar contacto"))) continue;
      await prisma.task.create({
        data: {
          title: `Retomar contacto con ${c.firstName} ${c.lastName} (lead frío)`,
          type: "Llamada",
          dueDate: addDays(0),
          contactId: c.id,
        },
      });
      await prisma.activity.create({
        data: {
          type: "sistema",
          content: `Automatización: lead sin actividad en ${frios.days} días — tarea de rescate creada.`,
          contactId: c.id,
        },
      });
    }
  }

  // Escalado: negocios grandes estancados → tarea urgente de reactivación
  const esc = await getRule("escalado_supervisor");
  if (esc?.enabled) {
    const limite = addDays(-esc.days);
    const grandes = await prisma.deal.findMany({
      where: {
        status: "open",
        pendingAction: null,
        amount: { gte: esc.amount ?? 5000 },
        updatedAt: { lt: limite },
      },
      include: { contact: true, tasks: { where: { done: false } } },
    });
    for (const d of grandes) {
      if (d.tasks.some((t) => t.title.startsWith("URGENTE: reactivar"))) continue;
      await prisma.task.create({
        data: {
          title: `URGENTE: reactivar negocio grande — ${d.title}`,
          type: "Seguimiento",
          dueDate: addDays(0),
          contactId: d.contactId,
          dealId: d.id,
        },
      });
      await prisma.activity.create({
        data: {
          type: "sistema",
          content: `Automatización: negocio de $${d.amount} sin movimiento en ${esc.days} días — escalado con tarea urgente.`,
          contactId: d.contactId,
          dealId: d.id,
        },
      });
    }
  }

  return true;
}
