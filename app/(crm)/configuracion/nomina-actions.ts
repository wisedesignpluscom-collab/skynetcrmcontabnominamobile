"use server";

// Salario mínimo vigente y umbral de riesgo del módulo de nómina. Mismo
// patrón que fiscal-actions.ts: solo admin, FormData y revalidatePath.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { fechaLocal } from "@/lib/fiscal/vencimientos";
import { setConfigRiesgoNomina } from "@/lib/nominaSettings";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const s = await getSession();
  if (!s || s.role !== "admin") throw new Error("Solo un administrador.");
}

// ── Salario mínimo vigente (histórico) ──────────────────────────────────────

export async function addSalarioMinimo(formData: FormData) {
  await requireAdmin();
  const raw = (formData.get("vigenteDesde") as string)?.trim();
  const monto = Number(formData.get("monto"));
  if (!raw || !Number.isFinite(monto) || monto <= 0) return;
  const [anio, mes, dia] = raw.split("-").map(Number);
  if (!anio || !mes || !dia) return;
  const vigenteDesde = fechaLocal(anio, mes, dia);
  const moneda = (formData.get("moneda") as string) === "USD" ? "USD" : "Bs";
  try {
    await prisma.salarioMinimo.create({
      data: {
        vigenteDesde,
        monto,
        moneda,
        notas: (formData.get("notas") as string)?.trim() || null,
      },
    });
  } catch (e) {
    // Ya existe una entrada con esa misma fecha de vigencia y moneda
    if (!(typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002")) throw e;
  }
  revalidatePath("/configuracion");
}

export async function deleteSalarioMinimo(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.salarioMinimo.delete({ where: { id } });
  revalidatePath("/configuracion");
}

// ── Umbral de riesgo (AppSetting "nomina_riesgo_config") ────────────────────

export async function saveConfigRiesgoNomina(formData: FormData) {
  await requireAdmin();
  const porciento = Number(formData.get("umbralCaidaPeriodo"));
  if (!Number.isFinite(porciento) || porciento <= 0 || porciento >= 100) return;
  await setConfigRiesgoNomina({ umbralCaidaPeriodo: porciento / 100 });
  revalidatePath("/configuracion");
}
