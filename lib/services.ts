// Catálogo de servicios (con precio USD) y la regla de precio bloqueado.
// El precio de la oportunidad se toma del servicio elegido cuando la regla
// "lock_deal_price" está activa (por defecto lo está); se puede desactivar en
// /configuracion para permitir precio libre.

import { prisma } from "@/lib/prisma";

const LOCK_KEY = "lock_deal_price";

export async function getActiveServices() {
  return prisma.service.findMany({
    where: { active: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
}

export async function listServices() {
  return prisma.service.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
}

// Precio bloqueado (por defecto true; solo "false" lo desactiva)
export async function isPriceLocked(): Promise<boolean> {
  const r = await prisma.appSetting.findUnique({ where: { key: LOCK_KEY } });
  return r ? r.value !== "false" : true;
}

export async function setPriceLocked(value: boolean): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: LOCK_KEY },
    update: { value: value ? "true" : "false" },
    create: { key: LOCK_KEY, value: value ? "true" : "false" },
  });
}

// Precio del servicio (para fijar el valor de la oportunidad server-side)
export async function priceForService(serviceId: string | null | undefined): Promise<number | null> {
  if (!serviceId) return null;
  const s = await prisma.service.findUnique({ where: { id: serviceId } });
  return s ? s.price : null;
}
