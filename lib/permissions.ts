// Permisos por rol — un solo lugar para las reglas de autorización.
// admin: todo. supervisor: aprueba, elimina y reasigna. vendedor: opera su cartera.

export const ROLES = ["admin", "supervisor", "vendedor"] as const;

export const roleLabels: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor de ventas",
  vendedor: "Vendedor",
};

export function canManageUsers(role?: string) {
  return role === "admin";
}

export function canDelete(role?: string) {
  return role === "admin" || role === "supervisor";
}

export function canReassign(role?: string) {
  return role === "admin" || role === "supervisor";
}

export function canApprove(role?: string) {
  return role === "admin" || role === "supervisor";
}

export function canManageAutomations(role?: string) {
  return role === "admin";
}

export function canViewAutomationLog(role?: string) {
  return role === "admin" || role === "supervisor";
}

// ── Alcance de datos por rol ────────────────────────────────────────────────
// El vendedor solo ve su cartera; admin/supervisor ven todo. Devuelven un
// fragmento `where` de Prisma ({} = sin filtro).
type Sess = { id: string; role?: string } | null | undefined;

export function isVendedor(role?: string) {
  return role === "vendedor";
}

// Deals del vendedor (por dueño)
export function dealScope(s: Sess) {
  return s && isVendedor(s.role) ? { ownerId: s.id } : {};
}

// Contactos del vendedor (por dueño)
export function contactScope(s: Sess) {
  return s && isVendedor(s.role) ? { ownerId: s.id } : {};
}

// Tareas del vendedor: propias o de sus contactos
export function taskScope(s: Sess) {
  return s && isVendedor(s.role)
    ? { OR: [{ ownerId: s.id }, { contact: { ownerId: s.id } }] }
    : {};
}

// Clientes del analista: los que tiene asignados como analista o supervisor
// (asignación directa en la ficha del cliente) y, además, aquellos donde tiene
// contactos u oportunidades a su nombre — así una cuenta sin analista asignado
// todavía la sigue viendo quien la trabaja.
export function companyScope(s: Sess) {
  return s && isVendedor(s.role)
    ? {
        OR: [
          { analistaId: s.id },
          { supervisorId: s.id },
          { contacts: { some: { ownerId: s.id } } },
          { deals: { some: { ownerId: s.id } } },
        ],
      }
    : {};
}

// Casos del analista: los que tiene asignados y los de los clientes de su
// cartera (un caso sin analista asignado lo sigue viendo quien lleva la cuenta).
export function recurringCaseScope(s: Sess) {
  return s && isVendedor(s.role)
    ? {
        OR: [
          { analistaId: s.id },
          { supervisorId: s.id },
          { company: companyScope(s) },
        ],
      }
    : {};
}

// Posventa del vendedor: seguimientos cuyo contacto u oportunidad es suyo
export function followUpScope(s: Sess) {
  return s && isVendedor(s.role)
    ? { OR: [{ contact: { ownerId: s.id } }, { deal: { ownerId: s.id } }] }
    : {};
}

// Actividad del vendedor: la de su cartera (contacto u oportunidad propios)
export function activityScope(s: Sess) {
  return s && isVendedor(s.role)
    ? { OR: [{ contact: { ownerId: s.id } }, { deal: { ownerId: s.id } }] }
    : {};
}

// ¿El vendedor `s` es dueño de esta entidad? (para proteger detalles por URL).
// admin/supervisor siempre true. `ownerId` es el dueño del registro.
export function ownsOrCanSeeAll(s: Sess, ownerId: string | null | undefined) {
  if (!s || !isVendedor(s.role)) return true;
  return ownerId === s.id;
}
