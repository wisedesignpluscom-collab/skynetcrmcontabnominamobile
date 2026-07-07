// Opciones dinámicas que el servidor inyecta al Builder: etapas, catálogos
// editables y usuarios reales. La clave coincide con DynamicOptionKey.

import { prisma } from "@/lib/prisma";
import type { DynamicOptions } from "@/components/automations/types";

export async function loadBuilderOptions(): Promise<DynamicOptions> {
  const [stages, catalog, users] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: { order: "asc" }, select: { name: true } }),
    prisma.catalogOption.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { label: "asc" }],
      select: { category: true, label: true },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const byCategory = (category: string) =>
    catalog
      .filter((o) => o.category === category)
      .map((o) => ({ value: o.label, label: o.label }));

  return {
    // in_stage compara contra nombre o id de la etapa; el nombre es legible
    stage: stages.map((s) => ({ value: s.name, label: s.name })),
    source: byCategory("source"),
    task_type: byCategory("task_type"),
    industry: byCategory("industry"),
    user: users.map((u) => ({ value: u.id, label: u.name })),
  };
}
