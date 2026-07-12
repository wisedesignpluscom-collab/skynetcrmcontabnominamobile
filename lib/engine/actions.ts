// ══ Automation Engine — Ejecutores de acciones de workflow (Fase 3) ═════════
// Cada ejecutor recibe el job y el registro fresco de la entidad, hace su
// efecto vía Prisma y devuelve un detalle legible que queda en el log del job.
// Errores lanzados se reintentan (ver queue.ts) salvo NonRetryableError.

import { prisma } from "@/lib/prisma";
import { getField } from "./evaluator";
import { emitEvent, MAX_EVENT_DEPTH } from "./events";
import { assertPublicUrl } from "@/lib/ssrf";
import type { WorkflowJob } from "@prisma/client";

// Error que NO tiene sentido reintentar (parámetros inválidos, entidad borrada…)
export class NonRetryableError extends Error {}

// Metadatos para el Builder — viven en builder.ts (módulo puro); se
// re-exportan desde aquí para los consumidores del lado servidor.
export { WORKFLOW_ACTIONS } from "./builder";

// ── Plantillas ───────────────────────────────────────────────────────────────
// Reemplaza {campo} o {contact.email} por el valor del registro del evento.
export function renderTemplate(text: string, record: Record<string, unknown>): string {
  return text.replace(/\{([\w.]+)\}/g, (_, path: string) => {
    const value = getField(record, path);
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toLocaleDateString("es-VE");
    return String(value);
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// ── Registro fresco de la entidad del evento ────────────────────────────────
// Con anidados (contact, deal, stage…) para plantillas y condiciones.
async function loadEntity(entity: string, id: string): Promise<Record<string, unknown> | null> {
  switch (entity) {
    case "contact":
      return prisma.contact.findUnique({ where: { id }, include: { company: true, owner: true } });
    case "company":
      return prisma.company.findUnique({ where: { id } });
    case "deal":
      return prisma.deal.findUnique({
        where: { id },
        include: { contact: true, company: true, stage: true, owner: true },
      });
    case "task":
      return prisma.task.findUnique({ where: { id }, include: { contact: true, deal: true } });
    case "followup":
      return prisma.followUp.findUnique({ where: { id }, include: { contact: true, deal: true } });
    default:
      return null;
  }
}

// A qué contacto/oportunidad se cuelgan tareas y actividades creadas por el workflow
function anchorsFor(entity: string, record: Record<string, unknown>) {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  switch (entity) {
    case "contact":
      return { contactId: s(record.id), dealId: null };
    case "deal":
      return { contactId: s(record.contactId), dealId: s(record.id) };
    case "task":
    case "followup":
      return { contactId: s(record.contactId), dealId: s(record.dealId) };
    default:
      return { contactId: null, dealId: null };
  }
}

// ── Campos actualizables por workflow (lista blanca por entidad) ─────────────
// Campos sensibles quedan fuera a propósito: amount pasa por aprobaciones,
// stageId por applyStageMove, ownerId por reasignación de cartera.
const UPDATABLE: Record<string, Record<string, "string" | "number" | "date">> = {
  contact: { status: "string", source: "string", position: "string", notes: "string" },
  company: { industry: "string", city: "string", notes: "string" },
  deal: { title: "string", probability: "number", expectedCloseDate: "date" },
  task: { title: "string", type: "string", description: "string", dueDate: "date" },
  followup: { stage: "string", nextContactDate: "date", notes: "string" },
};

// Valores de fecha: ISO ("2026-08-01") o relativo ("+30d" = dentro de 30 días)
function coerceDate(raw: string): Date {
  const rel = raw.trim().match(/^([+-]\d+)d$/);
  if (rel) return addDays(Number(rel[1]));
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new NonRetryableError(`Fecha inválida: «${raw}»`);
  return d;
}

// ── Ejecutores ───────────────────────────────────────────────────────────────

type ExecCtx = {
  job: WorkflowJob;
  params: Record<string, unknown>;
  record: Record<string, unknown>;
};

// Re-emite un evento derivado de una acción, arrastrando los guards anti-bucle
async function reEmit(
  job: WorkflowJob,
  type: string,
  entity: string,
  entityId: string,
  record: Record<string, unknown>
) {
  if (job.depth + 1 >= MAX_EVENT_DEPTH) return;
  let chain: string[] = [];
  try {
    chain = job.chain ? (JSON.parse(job.chain) as string[]) : [];
  } catch {}
  await emitEvent({ type, entity, entityId, record, depth: job.depth + 1, chain });
}

async function crearRegistro({ job, params, record }: ExecCtx): Promise<string> {
  const entidad = str(params.entidad);
  const datos = (params.datos ?? {}) as Record<string, unknown>;
  const t = (key: string) => renderTemplate(str(datos[key]), record).trim();
  const anchors = anchorsFor(job.entity, record);

  switch (entidad) {
    case "activity": {
      await prisma.activity.create({
        data: {
          type: "sistema",
          content: t("content") || `Workflow: actividad registrada (${job.trigger})`,
          contactId: anchors.contactId,
          dealId: anchors.dealId,
        },
      });
      return "Actividad registrada en el historial";
    }
    case "contact": {
      const firstName = t("firstName");
      const lastName = t("lastName");
      if (!firstName || !lastName)
        throw new NonRetryableError("crear_registro contact: firstName y lastName son obligatorios");
      const contact = await prisma.contact.create({
        data: {
          firstName,
          lastName,
          email: t("email") || null,
          phone: t("phone") || null,
          source: t("source") || null,
          status: t("status") || "lead",
          notes: t("notes") || null,
        },
      });
      await reEmit(job, "contact.created", "contact", contact.id, contact);
      return `Contacto creado: ${firstName} ${lastName}`;
    }
    case "deal": {
      const title = t("title");
      if (!title) throw new NonRetryableError("crear_registro deal: title es obligatorio");
      // Etapa por nombre; si no se indica o no existe, la primera abierta
      const stageName = t("stage");
      const stage = stageName
        ? await prisma.pipelineStage.findFirst({ where: { name: stageName, type: "open" } })
        : null;
      const firstStage =
        stage ?? (await prisma.pipelineStage.findFirst({ where: { type: "open" }, orderBy: { order: "asc" } }));
      if (!firstStage) throw new NonRetryableError("crear_registro deal: no hay etapas abiertas en el pipeline");
      const deal = await prisma.deal.create({
        data: {
          title,
          amount: Number(t("amount")) || 0,
          stageId: firstStage.id,
          contactId: anchors.contactId,
        },
      });
      await reEmit(job, "deal.created", "deal", deal.id, deal);
      return `Oportunidad creada: ${title} (etapa ${firstStage.name})`;
    }
    default:
      throw new NonRetryableError(
        `crear_registro: entidad «${entidad}» no soportada (use activity | contact | deal)`
      );
  }
}

async function actualizarCampos({ job, params, record }: ExecCtx): Promise<string> {
  const allowed = UPDATABLE[job.entity];
  if (!allowed) throw new NonRetryableError(`actualizar_campos: entidad «${job.entity}» no soportada`);

  const campos = (params.campos ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const [field, rawValue] of Object.entries(campos)) {
    const kind = allowed[field];
    if (!kind)
      throw new NonRetryableError(
        `actualizar_campos: el campo «${field}» de ${job.entity} no es actualizable por workflow`
      );
    const rendered = renderTemplate(str(rawValue), record).trim();
    if (kind === "number") {
      const n = Number(rendered);
      if (!Number.isFinite(n)) throw new NonRetryableError(`actualizar_campos: «${rendered}» no es un número`);
      data[field] = n;
    } else if (kind === "date") {
      data[field] = rendered ? coerceDate(rendered) : null;
    } else {
      data[field] = rendered || null;
    }
  }
  if (Object.keys(data).length === 0)
    throw new NonRetryableError("actualizar_campos: sin campos que actualizar");

  const tables = {
    contact: prisma.contact,
    company: prisma.company,
    deal: prisma.deal,
    task: prisma.task,
    followup: prisma.followUp,
  } as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (tables[job.entity as keyof typeof tables] as any).update({
    where: { id: job.entityId },
    data,
  });

  const anchors = anchorsFor(job.entity, record);
  const resumen = Object.keys(data).join(", ");
  if (anchors.contactId || anchors.dealId) {
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Workflow: campos actualizados (${resumen})`,
        contactId: anchors.contactId,
        dealId: anchors.dealId,
      },
    });
  }
  const fresh = await loadEntity(job.entity, job.entityId);
  if (fresh) await reEmit(job, `${job.entity}.updated`, job.entity, job.entityId, fresh);
  return `Campos actualizados: ${resumen}`;
}

async function crearTarea({ job, params, record }: ExecCtx): Promise<string> {
  const titulo = renderTemplate(str(params.titulo), record).trim();
  if (!titulo) throw new NonRetryableError("crear_tarea: falta el título");
  const anchors = anchorsFor(job.entity, record);
  const dias = Number(params.dias);

  const task = await prisma.task.create({
    data: {
      title: titulo,
      type: str(params.tipo) || "seguimiento",
      description: renderTemplate(str(params.descripcion), record).trim() || null,
      dueDate: Number.isFinite(dias) ? addDays(dias) : null,
      contactId: anchors.contactId,
      dealId: anchors.dealId,
    },
  });
  if (anchors.contactId || anchors.dealId) {
    await prisma.activity.create({
      data: {
        type: "sistema",
        content: `Workflow: tarea creada — ${titulo}`,
        contactId: anchors.contactId,
        dealId: anchors.dealId,
      },
    });
  }
  await reEmit(job, "task.created", "task", task.id, task);
  return `Tarea creada: ${titulo}`;
}

async function enviarNotificacion({ params, record }: ExecCtx): Promise<string> {
  const titulo = renderTemplate(str(params.titulo), record).trim();
  if (!titulo) throw new NonRetryableError("enviar_notificacion: falta el título");
  await prisma.notification.create({
    data: {
      title: titulo,
      body: renderTemplate(str(params.mensaje), record).trim() || null,
      url: str(params.url) || null,
    },
  });
  return `Notificación enviada: ${titulo}`;
}

async function enviarEmail({ params, record }: ExecCtx): Promise<string> {
  const para = renderTemplate(str(params.para), record).trim();
  if (!para || !para.includes("@"))
    throw new NonRetryableError(`enviar_email: destinatario inválido («${para || "vacío"}»)`);

  let asunto = renderTemplate(str(params.asunto), record).trim();
  let cuerpo = renderTemplate(str(params.cuerpo), record);

  // Si la acción referencia una plantilla, gana sobre el asunto/cuerpo inline:
  // se toma la plantilla y se resuelven sus variables contra el registro.
  const plantillaId = str(params.plantilla).trim();
  if (plantillaId) {
    const tpl = await prisma.emailTemplate.findUnique({ where: { id: plantillaId } });
    if (!tpl) throw new NonRetryableError("enviar_email: la plantilla seleccionada ya no existe");
    asunto = renderTemplate(tpl.subject, record).trim();
    cuerpo = renderTemplate(tpl.bodyHtml, record);
  }

  if (!asunto) throw new NonRetryableError("enviar_email: falta el asunto (o elegir una plantilla)");

  await prisma.emailOutbox.create({
    data: { to: para, subject: asunto, body: cuerpo },
  });
  return `Email a ${para} puesto en la bandeja de salida`;
}

async function llamarWebhook({ job, params, record }: ExecCtx): Promise<string> {
  const url = str(params.url);
  // Anti-SSRF: rechaza URLs que apunten a la red interna/loopback/metadata.
  try {
    await assertPublicUrl(url);
  } catch (e) {
    throw new NonRetryableError(`llamar_webhook: ${e instanceof Error ? e.message : "URL no permitida"} («${url}»)`);
  }

  const response = await fetch(url, {
    method: str(params.metodo).toUpperCase() === "GET" ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body:
      str(params.metodo).toUpperCase() === "GET"
        ? undefined
        : JSON.stringify({ evento: job.trigger, entidad: job.entity, id: job.entityId, registro: record }),
    signal: AbortSignal.timeout(10_000),
  });
  // No-2xx lanza y se reintenta con backoff
  if (!response.ok) throw new Error(`llamar_webhook: ${url} respondió ${response.status}`);
  return `Webhook llamado: ${url} → ${response.status}`;
}

// ── Punto de entrada de la cola ──────────────────────────────────────────────
export async function runAction(job: WorkflowJob): Promise<string> {
  let params: Record<string, unknown> = {};
  try {
    const parsed = job.params ? JSON.parse(job.params) : {};
    if (typeof parsed === "object" && parsed !== null) params = parsed;
  } catch {
    throw new NonRetryableError("Parámetros de la acción ilegibles (JSON inválido)");
  }

  // Registro fresco; si la entidad ya no existe (eventos *.deleted), el snapshot
  let record = await loadEntity(job.entity, job.entityId);
  if (!record && job.payload) {
    try {
      const snapshot = JSON.parse(job.payload);
      if (typeof snapshot === "object" && snapshot !== null) record = snapshot;
    } catch {}
  }
  if (!record) throw new NonRetryableError(`La entidad ${job.entity} ${job.entityId} ya no existe`);

  const ctx: ExecCtx = { job, params, record };
  switch (job.action) {
    case "crear_registro":
      return crearRegistro(ctx);
    case "actualizar_campos":
      return actualizarCampos(ctx);
    case "crear_tarea":
      return crearTarea(ctx);
    case "enviar_notificacion":
      return enviarNotificacion(ctx);
    case "enviar_email":
      return enviarEmail(ctx);
    case "llamar_webhook":
      return llamarWebhook(ctx);
    case "esperar":
      // «esperar» se consume al planificar (desplaza runAt); si llega aquí, no-op
      return "Espera ya aplicada al planificar";
    default:
      throw new NonRetryableError(`Acción desconocida: «${job.action}»`);
  }
}
