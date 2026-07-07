// ══ Automation Engine — Persistencia del Builder (Fase 4) ═══════════════════
// Convierte el borrador del Builder (RuleDraft) a las tablas relacionales de
// la Fase 1 (Rule + RuleGroup + RuleCondition + RuleAction) y de vuelta.
// Separado de las server actions para poder probarlo con tsx sin sesión.

import { prisma } from "@/lib/prisma";
import type { GroupDef } from "./evaluator";
import { emptyGroup, kindOfTrigger, type RuleDraft } from "./builder";

// ── Escribir: borrador → tablas ──────────────────────────────────────────────
// En edición se reemplazan grupos/condiciones/acciones completos (la cascada
// de RuleGroup limpia las condiciones). Todo dentro de una transacción.
export async function saveDraft(
  draft: RuleDraft,
  ruleId: string | null,
  userId: string | null
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const data = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      module: draft.module,
      trigger: draft.trigger,
      // Solo las Pipeline Rules quedan ligadas a una etapa
      stageId: draft.kind === "pipeline" && draft.stageId ? draft.stageId : null,
      enabled: draft.enabled,
      priority: draft.priority,
    };

    let id: string;
    if (ruleId) {
      await tx.rule.update({ where: { id: ruleId }, data });
      await tx.ruleGroup.deleteMany({ where: { ruleId, parentId: null } });
      await tx.ruleAction.deleteMany({ where: { ruleId } });
      id = ruleId;
    } else {
      const created = await tx.rule.create({ data: { ...data, createdById: userId } });
      id = created.id;
    }

    async function writeGroup(g: GroupDef, parentId: string | null, order: number) {
      const group = await tx.ruleGroup.create({
        data: { ruleId: id, parentId, operator: g.operator, order },
      });
      if (g.conditions.length > 0) {
        await tx.ruleCondition.createMany({
          data: g.conditions.map((c, i) => ({
            groupId: group.id,
            field: c.field,
            op: c.op,
            value: c.value ?? null,
            value2: c.value2 ?? null,
            order: i + 1,
          })),
        });
      }
      for (let i = 0; i < g.groups.length; i++) {
        await writeGroup(g.groups[i], group.id, i + 1);
      }
    }
    await writeGroup(draft.root, null, 0);

    if (draft.actions.length > 0) {
      await tx.ruleAction.createMany({
        data: draft.actions.map((a, i) => ({
          ruleId: id,
          type: a.type,
          params: JSON.stringify(a.params),
          order: i + 1,
        })),
      });
    }
    return id;
  });
}

// ── Leer: tablas → borrador ──────────────────────────────────────────────────
export async function loadDraft(
  ruleId: string
): Promise<{ draft: RuleDraft; isSystem: boolean } | null> {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: {
      actions: { orderBy: { order: "asc" } },
      groups: {
        orderBy: { order: "asc" },
        include: { conditions: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!rule) return null;

  const kind = kindOfTrigger(rule.trigger);
  if (!kind) return null; // regla sin trigger reconocible: el Builder no la edita

  // Mismo ensamblaje del árbol que lib/engine/load.ts
  const nodes = new Map<string, GroupDef & { _parentId: string | null }>();
  for (const g of rule.groups) {
    nodes.set(g.id, {
      _parentId: g.parentId,
      operator: g.operator === "OR" ? "OR" : "AND",
      conditions: g.conditions.map((c) => ({
        field: c.field,
        op: c.op as GroupDef["conditions"][number]["op"],
        value: c.value,
        value2: c.value2,
      })),
      groups: [],
    });
  }
  let root: GroupDef | null = null;
  for (const node of nodes.values()) {
    if (node._parentId === null) {
      if (!root) root = node;
    } else {
      nodes.get(node._parentId)?.groups.push(node);
    }
  }
  // Quitar la propiedad auxiliar del ensamblaje: el borrador debe ser un
  // GroupDef limpio (el Builder lo compara y serializa tal cual)
  for (const node of nodes.values()) {
    delete (node as Partial<typeof node>)._parentId;
  }

  return {
    isSystem: rule.isSystem,
    draft: {
      name: rule.name,
      description: rule.description ?? "",
      kind,
      module: rule.module,
      trigger: rule.trigger ?? "",
      stageId: rule.stageId ?? "",
      enabled: rule.enabled,
      priority: rule.priority,
      root: root ?? emptyGroup(),
      actions: rule.actions.map((a) => {
        let params: Record<string, string> = {};
        try {
          const parsed = JSON.parse(a.params ?? "{}");
          if (parsed && typeof parsed === "object") {
            params = Object.fromEntries(
              Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")])
            );
          }
        } catch {
          // params corruptos: se editan desde cero
        }
        return { type: a.type, params };
      }),
    },
  };
}
