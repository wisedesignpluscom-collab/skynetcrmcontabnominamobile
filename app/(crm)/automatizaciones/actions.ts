"use server";

import { prisma } from "@/lib/prisma";
import { getSession, type SessionUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateDraft, type RuleDraft } from "@/lib/engine/builder";
import { saveDraft, loadDraft, restoreVersion } from "@/lib/engine/persist";
import { invalidateRulesCache } from "@/lib/engine/load";
import { exportRules, importRules, type ImportSummary } from "@/lib/engine/portable";
import { canManageAutomations, canViewAutomationLog } from "@/lib/permissions";

// Mutaciones (crear/editar/activar/eliminar/importar/restaurar): solo admin.
async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session || !canManageAutomations(session.role)) {
    throw new Error("Solo un administrador puede gestionar las automatizaciones.");
  }
  return session;
}

// Lectura sensible (exportar, ver historial): admin o supervisor.
async function requireLogAccess(): Promise<SessionUser> {
  const session = await getSession();
  if (!session || !canViewAutomationLog(session.role)) {
    throw new Error("No tienes permiso para ver el historial de automatizaciones.");
  }
  return session;
}

// Firma del autor para la auditoría (id + nombre congelado)
function authorOf(session: SessionUser) {
  return { id: session.id, name: session.name };
}

export type SaveResult = { ok: boolean; errors: string[]; id?: string };

// La llama el Builder (componente cliente) con el borrador serializado.
export async function saveAutomation(
  ruleId: string | null,
  draftJson: string
): Promise<SaveResult> {
  const session = await requireAdmin();

  let draft: RuleDraft;
  try {
    draft = JSON.parse(draftJson) as RuleDraft;
  } catch {
    return { ok: false, errors: ["El borrador llegó dañado. Recarga la página."] };
  }

  const errors = validateDraft(draft);
  if (errors.length > 0) return { ok: false, errors };

  // Pipeline Rules: la etapa debe seguir existiendo (pudo eliminarse mientras
  // se editaba el borrador)
  if (draft.kind === "pipeline") {
    const stage = await prisma.pipelineStage.findUnique({ where: { id: draft.stageId } });
    if (!stage) return { ok: false, errors: ["La etapa seleccionada ya no existe. Recarga la página."] };
  }

  if (ruleId) {
    const existing = await prisma.rule.findUnique({ where: { id: ruleId } });
    if (!existing) return { ok: false, errors: ["La regla ya no existe."] };
  }

  const id = await saveDraft(draft, ruleId, authorOf(session));
  revalidatePath("/automatizaciones");
  return { ok: true, errors: [], id };
}

export async function toggleAutomation(formData: FormData) {
  const session = await requireAdmin();
  const id = formData.get("ruleId") as string;
  if (!id) return;

  const rule = await prisma.rule.findUnique({ where: { id } });
  if (!rule) return;

  // Reusar saveDraft para que el cambio de estado quede versionado (auditoría)
  const loaded = await loadDraft(id);
  if (loaded) {
    await saveDraft(
      { ...loaded.draft, enabled: !rule.enabled },
      id,
      authorOf(session),
      rule.enabled ? "deactivated" : "activated"
    );
  } else {
    // Regla sin trigger reconocible por el Builder: cambio directo
    await prisma.rule.update({ where: { id }, data: { enabled: !rule.enabled } });
    invalidateRulesCache();
  }
  revalidatePath("/automatizaciones");
}

export async function deleteAutomation(formData: FormData) {
  await requireAdmin();
  const id = formData.get("ruleId") as string;
  if (!id) return;

  const rule = await prisma.rule.findUnique({ where: { id } });
  // Las reglas de sistema no se eliminan (solo se desactivan)
  if (!rule || rule.isSystem) return;

  // La cascada limpia grupos, condiciones, acciones y versiones; los WorkflowJob
  // del historial conservan su fila con ruleId en null (onDelete: SetNull)
  await prisma.rule.delete({ where: { id } });
  invalidateRulesCache();
  revalidatePath("/automatizaciones");
}

export async function duplicateAutomation(formData: FormData) {
  const session = await requireAdmin();
  const id = formData.get("ruleId") as string;
  if (!id) return;

  const loaded = await loadDraft(id);
  if (!loaded) return;

  const copy: RuleDraft = {
    ...loaded.draft,
    name: `${loaded.draft.name} (copia)`,
    enabled: false, // las copias nacen apagadas para editarlas con calma
  };
  const newId = await saveDraft(copy, null, authorOf(session));
  revalidatePath("/automatizaciones");
  redirect(`/automatizaciones/${newId}`);
}

// ── Rollback ──────────────────────────────────────────────────────────────────
export type RestoreResult = { ok: boolean; errors: string[] };

export async function restoreAutomationVersion(
  ruleId: string,
  versionId: string
): Promise<RestoreResult> {
  const session = await requireAdmin();
  const result = await restoreVersion(ruleId, versionId, authorOf(session));
  revalidatePath("/automatizaciones");
  revalidatePath(`/automatizaciones/${ruleId}`);
  return result;
}

// ── Export / Import ────────────────────────────────────────────────────────────
// Exporta todas las reglas a un JSON portable (supervisor+ puede exportar).
export async function exportAutomations(): Promise<string> {
  await requireLogAccess();
  const bundle = await exportRules();
  return JSON.stringify(bundle, null, 2);
}

// Importa un bundle pegado por el admin.
export async function importAutomations(raw: string): Promise<ImportSummary> {
  const session = await requireAdmin();
  const summary = await importRules(raw, authorOf(session));
  revalidatePath("/automatizaciones");
  return summary;
}
