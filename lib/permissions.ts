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
