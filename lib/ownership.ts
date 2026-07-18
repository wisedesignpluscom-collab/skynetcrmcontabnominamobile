// Guardas de propiedad (server-only): ¿este vendedor puede ver/tocar el registro?
// admin/supervisor siempre pueden; el vendedor solo si es el dueño asignado.
// Se separa de lib/permissions.ts (puro) porque aquí sí se consulta Prisma.
import { prisma } from "@/lib/prisma";
import { isVendedor } from "@/lib/permissions";

type Sess = { id: string; role?: string } | null | undefined;

export async function canAccessContact(s: Sess, contactId: string) {
  if (!s) return false;
  if (!isVendedor(s.role)) return true;
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { ownerId: true },
  });
  return !!c && c.ownerId === s.id;
}

export async function canAccessDeal(s: Sess, dealId: string) {
  if (!s) return false;
  if (!isVendedor(s.role)) return true;
  const d = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { ownerId: true },
  });
  return !!d && d.ownerId === s.id;
}
