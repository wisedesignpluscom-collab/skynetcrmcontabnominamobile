// ══ Automation Engine — Cargador de reglas (Fase 1 · caché en Fase 6) ═══════
// Lee Rule + RuleGroup + RuleCondition + RuleAction desde Prisma y arma las
// estructuras puras (RuleDef) que consume el evaluador. El árbol de grupos se
// ensambla en memoria a partir de consultas planas (sin includes recursivos).
//
// Fase 6 (performance): las reglas se leen en casi todos los eventos del CRM y
// cambian poco. Se cachean los RuleDef[] por combinación de filtro; cualquier
// mutación de reglas (guardar, activar, eliminar, importar, restaurar) llama a
// invalidateRulesCache(). Instalación de una sola empresa = un solo proceso
// Node, así que un Map en memoria es suficiente y correcto.

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

// Tope de anidamiento al ensamblar el árbol desde la BD: defensa ante datos
// cíclicos o malformados (el Builder ya limita a 5 niveles en la entrada).
const MAX_TREE_DEPTH = 20;

// ── Caché de reglas activas ──────────────────────────────────────────────────
type LoadFilter = { module?: string; trigger?: string; stageId?: string; onlyEnabled?: boolean };

// Toda mutación de reglas llama a invalidateRulesCache() → frescura inmediata en
// el proceso que hizo el cambio. El TTL es una red de seguridad: acota la
// obsolescencia si alguna vez corrieran varios procesos (otro no vería el
// invalidate). 30 s es imperceptible para reglas que cambian rara vez.
const CACHE_TTL_MS = 30_000;

const rulesCache = new Map<string, { at: number; data: RuleDef[] }>();

function cacheKey(filter?: LoadFilter): string {
  return JSON.stringify({
    module: filter?.module ?? null,
    trigger: filter?.trigger ?? null,
    stageId: filter?.stageId ?? null,
    onlyEnabled: filter?.onlyEnabled ?? true,
  });
}

// La llaman todas las mutaciones de reglas. Vaciar todo (no por-clave) es
// simple y seguro: un cambio de prioridad o de etapa afecta varias claves.
export function invalidateRulesCache(): void {
  rulesCache.clear();
}

export async function loadRules(filter?: LoadFilter): Promise<RuleDef[]> {
  const key = cacheKey(filter);
  const cached = rulesCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const rules = await prisma.rule.findMany({
    where: {
      ...(filter?.module ? { module: filter.module } : {}),
      ...(filter?.trigger ? { trigger: filter.trigger } : {}),
      ...(filter?.stageId ? { stageId: filter.stageId } : {}),
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

  const result = rules.map((rule) => {
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

    // Poda de defensa: si los datos tuvieran un ciclo (padre que desciende de un
    // hijo), corta al superar la profundidad máxima para no recursar sin fin
    // luego en el evaluador. Con datos sanos del Builder no se activa nunca.
    if (root) pruneDeepGroups(root, 1);

    return {
      id: rule.id,
      name: rule.name,
      module: rule.module,
      trigger: rule.trigger,
      stageId: rule.stageId,
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

  rulesCache.set(key, { at: Date.now(), data: result });
  return result;
}

// Recorta subgrupos que superen MAX_TREE_DEPTH (in situ). Evita árboles
// infinitos si la BD llegara a tener un ciclo de parentId.
function pruneDeepGroups(group: GroupDef, depth: number): void {
  if (depth >= MAX_TREE_DEPTH) {
    group.groups = [];
    return;
  }
  for (const child of group.groups) pruneDeepGroups(child, depth + 1);
}
