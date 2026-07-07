"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateDraft, type RuleDraft } from "@/lib/engine/builder";
import { saveDraft, loadDraft } from "@/lib/engine/persist";
import { canManageAutomations } from "@/lib/permissions";

async function requireAdmin() {
  const session = await getSession();
  if (!session || !canManageAutomations(session.role)) {
    throw new Error("Solo un administrador puede gestionar las automatizaciones.");
  }
  return session;
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

  const id = await saveDraft(draft, ruleId, session.id);
  revalidatePath("/automatizaciones");
  return { ok: true, errors: [], id };
}

export async function toggleAutomation(formData: FormData) {
  await requireAdmin();
  const id = formData.get("ruleId") as string;
  if (!id) return;

  const rule = await prisma.rule.findUnique({ where: { id } });
  if (!rule) return;

  await prisma.rule.update({ where: { id }, data: { enabled: !rule.enabled } });
  revalidatePath("/automatizaciones");
}

export async function deleteAutomation(formData: FormData) {
  await requireAdmin();
  const id = formData.get("ruleId") as string;
  if (!id) return;

  const rule = await prisma.rule.findUnique({ where: { id } });
  // Las reglas de sistema no se eliminan (solo se desactivan)
  if (!rule || rule.isSystem) return;

  // La cascada limpia grupos, condiciones y acciones; los WorkflowJob del
  // historial conservan su fila con ruleId en null (onDelete: SetNull)
  await prisma.rule.delete({ where: { id } });
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
  const newId = await saveDraft(copy, null, session.id);
  revalidatePath("/automatizaciones");
  redirect(`/automatizaciones/${newId}`);
}
