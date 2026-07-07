// ══ Automation Engine — Versionado y auditoría de reglas (Fase 6) ═══════════
// Primitivas de bajo nivel para el historial de cada regla: escribir un
// snapshot por cambio y listarlos. NO importa persist.ts (para evitar ciclos):
// saveDraft/restoreVersion viven en persist.ts y usan writeVersion desde aquí.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { RuleDraft } from "./builder";

export type VersionAuthor = { id: string; name: string } | null;

// Etiqueta de la acción que originó la versión (para el historial de auditoría)
export type VersionAction =
  | "created"
  | "updated"
  | "activated"
  | "deactivated"
  | "restored"
  | "imported";

export const VERSION_ACTION_LABELS: Record<VersionAction, string> = {
  created: "Creada",
  updated: "Editada",
  activated: "Activada",
  deactivated: "Desactivada",
  restored: "Restaurada",
  imported: "Importada",
};

// Acepta tanto el cliente normal como el de una transacción (mismos métodos).
type DbClient = Prisma.TransactionClient | typeof prisma;

// Graba una nueva versión con el snapshot del borrador. El número es incremental
// por regla (max+1). Se llama SIEMPRE dentro de la misma operación que cambia la
// regla (idealmente en la transacción) para que historial y estado no diverjan.
export async function writeVersion(
  db: DbClient,
  ruleId: string,
  draft: RuleDraft,
  action: VersionAction,
  author: VersionAuthor
): Promise<void> {
  const last = await db.ruleVersion.findFirst({
    where: { ruleId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  await db.ruleVersion.create({
    data: {
      ruleId,
      version: (last?.version ?? 0) + 1,
      snapshot: JSON.stringify(draft),
      action,
      authorId: author?.id ?? null,
      authorName: author?.name ?? null,
    },
  });
}

export type VersionEntry = {
  id: string;
  version: number;
  action: VersionAction;
  authorName: string | null;
  createdAt: Date;
};

// Historial de una regla, de la más reciente a la más antigua.
export async function listVersions(ruleId: string): Promise<VersionEntry[]> {
  const rows = await prisma.ruleVersion.findMany({
    where: { ruleId },
    orderBy: { version: "desc" },
    include: { author: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    action: r.action as VersionAction,
    // Prefiere el nombre vivo del autor; cae al congelado si el usuario se borró
    authorName: r.author?.name ?? r.authorName,
    createdAt: r.createdAt,
  }));
}

// Devuelve el borrador guardado en una versión concreta (para previsualizar o
// restaurar). Parseo defensivo: si el snapshot está corrupto, devuelve null.
export async function getVersionSnapshot(versionId: string): Promise<RuleDraft | null> {
  const row = await prisma.ruleVersion.findUnique({ where: { id: versionId } });
  if (!row) return null;
  try {
    return JSON.parse(row.snapshot) as RuleDraft;
  } catch {
    return null;
  }
}
