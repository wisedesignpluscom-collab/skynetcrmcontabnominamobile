"use server";

// Umbrales de la matriz de segmentación (Etapa 4 «Mis Consultores») — AppSetting
// "segmentacion_config". Mismo patrón que nomina-actions.ts: solo admin,
// FormData y revalidatePath.

import { getSession } from "@/lib/session";
import { setConfigSegmentacion } from "@/lib/segmentacionSettings";
import { DEFAULT_CONFIG_SEGMENTACION } from "@/lib/segmentacion";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const s = await getSession();
  if (!s || s.role !== "admin") throw new Error("Solo un administrador.");
}

export async function saveConfigSegmentacion(formData: FormData) {
  await requireAdmin();
  const umbralRentabilidadUsd = Number(formData.get("umbralRentabilidadUsd"));
  const umbralRentabilidadBs = Number(formData.get("umbralRentabilidadBs"));
  const porcientoIncumplimiento = Number(formData.get("umbralIncumplimiento"));

  if (
    !Number.isFinite(umbralRentabilidadUsd) ||
    umbralRentabilidadUsd <= 0 ||
    !Number.isFinite(umbralRentabilidadBs) ||
    umbralRentabilidadBs <= 0 ||
    !Number.isFinite(porcientoIncumplimiento) ||
    porcientoIncumplimiento <= 0 ||
    porcientoIncumplimiento >= 100
  ) {
    return;
  }

  await setConfigSegmentacion({
    umbralRentabilidadUsd,
    umbralRentabilidadBs,
    umbralIncumplimiento: porcientoIncumplimiento / 100,
  });
  revalidatePath("/configuracion");
  revalidatePath("/empresas");
}

export async function restaurarConfigSegmentacionPorDefecto() {
  await requireAdmin();
  await setConfigSegmentacion(DEFAULT_CONFIG_SEGMENTACION);
  revalidatePath("/configuracion");
  revalidatePath("/empresas");
}
