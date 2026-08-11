// Config de la matriz de segmentación — AppSetting "segmentacion_config".
// Prisma-touching (a diferencia de lib/segmentacion.ts, que se mantiene puro);
// mismo patrón que lib/health.ts (JSON, merge sobre los defaults por si falta
// alguna clave).

import { prisma } from "@/lib/prisma";
import { DEFAULT_CONFIG_SEGMENTACION, type ConfigSegmentacion } from "@/lib/segmentacion";

const KEY = "segmentacion_config";

export async function getConfigSegmentacion(): Promise<ConfigSegmentacion> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_CONFIG_SEGMENTACION;
  try {
    const c = JSON.parse(row.value) as Partial<ConfigSegmentacion>;
    const merged = { ...DEFAULT_CONFIG_SEGMENTACION, ...c };
    return Object.values(merged).every((v) => typeof v === "number" && Number.isFinite(v))
      ? merged
      : DEFAULT_CONFIG_SEGMENTACION;
  } catch {
    return DEFAULT_CONFIG_SEGMENTACION;
  }
}

export async function setConfigSegmentacion(config: ConfigSegmentacion): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(config) },
    create: { key: KEY, value: JSON.stringify(config) },
  });
}
