// ══ Automation Engine — Cargador de reglas (Fase 1) ════════════════════════
// Lee Rule + RuleGroup + RuleCondition + RuleAction desde Prisma y arma las
// estructuras puras (RuleDef) que consume el evaluador. El árbol de grupos se
// ensambla en memoria a partir de consultas planas (sin includes recursivos).

import { prisma } from "@/lib/prisma";
import type { RuleDef, GroupDef, ConditionDef, OperatorCode } from "./evaluator";

function parseParams(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function loadRules(filter?: {
  module?: string;
  trigger?: string;
  onlyEnabled?: boolean;
}): Promise<RuleDef[]> {
  const rules = await prisma.rule.findMany({
    where: {
      ...(filter?.module ? { module: filter.module } : {}),
      ...(filter?.trigger ? { trigger: filter.trigger } : {}),
      ...(filter?.onlyEnabled === false ? {} : { enabled: true }),
    },
    include: {
      actions: { orderBy: { order: "asc" } },
      groups: {
        orderBy: { order: "asc" },
        include: { conditions: { orderBy: { order: "asc" } } },
      },
    },
    orderBy: { priority: "asc" },
  });

  return rules.map((rule) => {
    // Ensamblar el árbol: cada grupo conoce a su padre por parentId
    const nodes = new Map<string, GroupDef & { _id: string; _parentId: string | null }>();
    for (const g of rule.groups) {
      nodes.set(g.id, {
        _id: g.id,
        _parentId: g.parentId,
        operator: g.operator === "OR" ? "OR" : "AND",
        conditions: g.conditions.map(
          (c): ConditionDef => ({
            field: c.field,
            op: c.op as OperatorCode,
            value: c.value,
            value2: c.value2,
          })
        ),
        groups: [],
      });
    }

    let root: GroupDef | null = null;
    for (const node of nodes.values()) {
      if (node._parentId === null) {
        // Si hubiera más de una raíz, se toma la primera por orden
        if (!root) root = node;
      } else {
        nodes.get(node._parentId)?.groups.push(node);
      }
    }

    return {
      id: rule.id,
      name: rule.name,
      module: rule.module,
      trigger: rule.trigger,
      enabled: rule.enabled,
      priority: rule.priority,
      root,
      actions: rule.actions.map((a) => ({
        type: a.type,
        params: parseParams(a.params),
        order: a.order,
      })),
    };
  });
}
