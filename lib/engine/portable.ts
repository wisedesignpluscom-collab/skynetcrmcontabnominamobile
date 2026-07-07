// ══ Automation Engine — Import/export de reglas (Fase 6) ════════════════════
// Mueve reglas entre ambientes (dev → prod). Clave del diseño: los IDs de BD
// (regla, etapa, usuario) difieren entre ambientes, así que el bundle portable
// serializa la ETAPA POR NOMBRE y descarta todos los ids. Al importar, la etapa
// se re-resuelve por nombre en el ambiente destino.

import { prisma } from "@/lib/prisma";
import { loadDraft, saveDraft } from "./persist";
import { validateDraft, type RuleDraft } from "./builder";
import type { VersionAuthor } from "./versions";

export const EXPORT_FORMAT = "nogui-automations/v1";

// Un RuleDraft sin ids: la etapa viaja por nombre en vez de por stageId.
export type PortableRule = Omit<RuleDraft, "stageId"> & { stageName: string | null };

export type ExportBundle = {
  format: string;
  exportedAt: string;
  rules: PortableRule[];
};

// Exporta reglas (todas, o las indicadas) a un bundle portable.
export async function exportRules(ruleIds?: string[]): Promise<ExportBundle> {
  const rules = await prisma.rule.findMany({
    where: ruleIds && ruleIds.length ? { id: { in: ruleIds } } : {},
    select: { id: true, stageId: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  const stages = await prisma.pipelineStage.findMany({ select: { id: true, name: true } });
  const stageName = new Map(stages.map((s) => [s.id, s.name]));

  const portable: PortableRule[] = [];
  for (const r of rules) {
    const loaded = await loadDraft(r.id);
    if (!loaded) continue; // reglas sin trigger reconocible no se exportan
    const { stageId: _drop, ...rest } = loaded.draft;
    void _drop;
    portable.push({ ...rest, stageName: r.stageId ? stageName.get(r.stageId) ?? null : null });
  }
  return { format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), rules: portable };
}

export type ImportSummary = {
  ok: boolean;
  created: string[];
  updated: string[];
  skipped: { name: string; reason: string }[];
  error?: string;
};

// Importa un bundle en el ambiente actual. Empareja por NOMBRE: si ya existe una
// regla con ese nombre la reescribe (nueva versión "imported"); si no, la crea.
// Las reglas de sistema nunca se sobreescriben. Las Pipeline Rules cuya etapa no
// exista localmente se omiten con motivo (no se inventa una etapa).
export async function importRules(raw: string, author: VersionAuthor): Promise<ImportSummary> {
  const empty: ImportSummary = { ok: false, created: [], updated: [], skipped: [] };

  let bundle: ExportBundle;
  try {
    bundle = JSON.parse(raw);
  } catch {
    return { ...empty, error: "El texto pegado no es JSON válido." };
  }
  if (!bundle || bundle.format !== EXPORT_FORMAT || !Array.isArray(bundle.rules)) {
    return { ...empty, error: "El archivo no es un export de automatizaciones de Nogui." };
  }

  const stages = await prisma.pipelineStage.findMany({ select: { id: true, name: true } });
  const stageByName = new Map(stages.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const pr of bundle.rules) {
    const name = (pr?.name ?? "").trim();
    if (!name) {
      skipped.push({ name: "(sin nombre)", reason: "no tiene nombre" });
      continue;
    }

    // Reconstruir el borrador local resolviendo la etapa por nombre
    const { stageName, ...rest } = pr;
    const draft: RuleDraft = { ...rest, stageId: "" };
    if (pr.kind === "pipeline") {
      const localId = stageByName.get((stageName ?? "").trim().toLowerCase());
      if (!localId) {
        skipped.push({ name, reason: `no existe la etapa «${stageName ?? "?"}» aquí` });
        continue;
      }
      draft.stageId = localId;
    }

    const errors = validateDraft(draft);
    if (errors.length > 0) {
      skipped.push({ name, reason: errors[0] });
      continue;
    }

    const existing = await prisma.rule.findFirst({ where: { name } });
    if (existing?.isSystem) {
      skipped.push({ name, reason: "es una regla de sistema (protegida)" });
      continue;
    }

    if (existing) {
      await saveDraft(draft, existing.id, author, "imported");
      updated.push(name);
    } else {
      await saveDraft(draft, null, author, "imported");
      created.push(name);
    }
  }

  return { ok: true, created, updated, skipped };
}
