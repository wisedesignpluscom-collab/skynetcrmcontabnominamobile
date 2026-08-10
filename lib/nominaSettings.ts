// Config de riesgo del módulo de nómina — AppSetting "nomina_riesgo_config".
// Prisma-touching (a diferencia de lib/nomina.ts, que se mantiene puro); mismo
// espíritu que getHealthConfig/saveHealthConfig en lib/health.ts.

import { prisma } from "@/lib/prisma";
import { DEFAULT_CONFIG_RIESGO_NOMINA, type ConfigRiesgoNomina } from "@/lib/nomina";

const KEY = "nomina_riesgo_config";

export async function getConfigRiesgoNomina(): Promise<ConfigRiesgoNomina> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const umbral = row ? Number(row.value) : NaN;
  return Number.isFinite(umbral) && umbral > 0 && umbral < 1
    ? { umbralCaidaPeriodo: umbral }
    : DEFAULT_CONFIG_RIESGO_NOMINA;
}

export async function setConfigRiesgoNomina(config: ConfigRiesgoNomina): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    update: { value: String(config.umbralCaidaPeriodo) },
    create: { key: KEY, value: String(config.umbralCaidaPeriodo) },
  });
}
