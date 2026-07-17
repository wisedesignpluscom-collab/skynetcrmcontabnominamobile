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
