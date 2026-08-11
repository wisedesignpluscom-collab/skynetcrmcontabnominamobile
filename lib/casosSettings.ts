// Umbral de estancamiento de casos — AppSetting "casos_umbral_estancamiento".
// Prisma-touching (a diferencia de lib/casos.ts, que se mantiene puro); mismo
// patrón que lib/nominaSettings.ts.

import { prisma } from "@/lib/prisma";
import { DEFAULT_UMBRAL_ESTANCAMIENTO_DIAS } from "@/lib/casos";

const KEY = "casos_umbral_estancamiento";

export async function getUmbralEstancamiento(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const umbral = row ? Number(row.value) : NaN;
  return Number.isFinite(umbral) && umbral > 0 ? umbral : DEFAULT_UMBRAL_ESTANCAMIENTO_DIAS;
}

export async function setUmbralEstancamiento(dias: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    update: { value: String(dias) },
    create: { key: KEY, value: String(dias) },
  });
}
