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

// Tarea: el analista accede si es suya o si cuelga de un contacto suyo.
// Espeja taskScope de lib/permissions.ts.
export async function canAccessTask(s: Sess, taskId: string) {
  if (!s) return false;
  if (!isVendedor(s.role)) return true;
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    include: { contact: { select: { ownerId: true } } },
  });
  return !!t && (t.ownerId === s.id || t.contact?.ownerId === s.id);
}

// Cliente (empresa): el analista accede si la cuenta es suya por asignación
// directa (analista/supervisor) o si tiene contactos u oportunidades en ella.
// Espeja companyScope de lib/permissions.ts.
export async function canAccessCompany(s: Sess, companyId: string) {
  if (!s) return false;
  if (!isVendedor(s.role)) return true;
  const c = await prisma.company.findFirst({
    where: {
      id: companyId,
      OR: [
        { analistaId: s.id },
        { supervisorId: s.id },
        { contacts: { some: { ownerId: s.id } } },
        { deals: { some: { ownerId: s.id } } },
      ],
    },
    select: { id: true },
  });
  return !!c;
}
