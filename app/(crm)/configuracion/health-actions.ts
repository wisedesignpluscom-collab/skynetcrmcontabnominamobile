"use server";

import { getSession } from "@/lib/session";
import {
  saveHealthConfig,
  recomputeAllHealth,
  DEFAULT_HEALTH_CONFIG,
  type HealthConfig,
} from "@/lib/health";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") throw new Error("Solo un administrador.");
  return session;
}

export type HealthConfigInput = {
  weights: {
    satisfaccion: string;
    contacto: string;
    recencia: string;
    tareas: string;
    antiguedad: string;
  };
  thresholds: { verde: string; amarillo: string };
};

export type ActionFeedback = { ok: boolean; error?: string };

const num = (v: string, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

async function applyAndRefresh(cfg: HealthConfig) {
  await saveHealthConfig(cfg);
  // Aplica los nuevos pesos/umbrales a toda la cartera de una vez
  await recomputeAllHealth();
  revalidatePath("/configuracion");
  revalidatePath("/posventa");
  revalidatePath("/");
}

export async function saveHealthScoreConfig(input: HealthConfigInput): Promise<ActionFeedback> {
  await requireAdmin();

  const cfg: HealthConfig = {
    weights: {
      satisfaccion: num(input.weights.satisfaccion, 0),
      contacto: num(input.weights.contacto, 0),
      recencia: num(input.weights.recencia, 0),
      tareas: num(input.weights.tareas, 0),
      antiguedad: num(input.weights.antiguedad, 0),
    },
    thresholds: {
      verde: num(input.thresholds.verde, 70),
      amarillo: num(input.thresholds.amarillo, 45),
    },
  };

  const totalW =
    cfg.weights.satisfaccion +
    cfg.weights.contacto +
    cfg.weights.recencia +
    cfg.weights.tareas +
    cfg.weights.antiguedad;
  if (totalW <= 0) return { ok: false, error: "Los pesos no pueden ser todos cero." };
  if (cfg.thresholds.verde > 100 || cfg.thresholds.amarillo > 100) {
    return { ok: false, error: "Los umbrales van de 0 a 100." };
  }
  if (cfg.thresholds.amarillo >= cfg.thresholds.verde) {
    return { ok: false, error: "El umbral «Sano» debe ser mayor que el de «Atención»." };
  }

  await applyAndRefresh(cfg);
  return { ok: true };
}

export async function resetHealthScoreConfig(): Promise<ActionFeedback> {
  await requireAdmin();
  await applyAndRefresh(DEFAULT_HEALTH_CONFIG);
  return { ok: true };
}
