// Permisos por rol — un solo lugar para las reglas de autorización.
// admin: todo. supervisor: aprueba, elimina y reasigna. vendedor: opera su cartera.
//
// En la firma contable los roles se llaman Gerente / Supervisor / Analista, pero
// las CLAVES internas siguen siendo admin | supervisor | vendedor: cambiarlas
// obligaría a reescribir toda la lógica de permisos, las sesiones ya emitidas y
// las condiciones «has_role» de las reglas guardadas en la base. El
// reetiquetado vive aquí y toda la UI lo toma de este diccionario.

export const ROLES = ["admin", "supervisor", "vendedor"] as const;

export const roleLabels: Record<string, string> = {
  admin: "Gerente",
  supervisor: "Supervisor",
  vendedor: "Analista",
};

// Etiqueta del rol para textos corridos ("pedido por un analista")
export function roleLabel(role?: string | null): string {
  return roleLabels[role ?? ""] ?? "usuario";
}

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

// Crear/desactivar/resetear credenciales del portal de clientes. Mismo nivel
// que canReassign: quien ya puede mover analista/supervisor de una cuenta
// puede darle acceso al portal a ese cliente.
export function canManagePortalAccess(role?: string) {
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

// Declaraciones de nómina del analista: las de los trabajadores de su cartera
// (la declaración no tiene dueño propio, hereda el de la empresa del trabajador).
export function nominaRiesgoScope(s: Sess) {
  return s && isVendedor(s.role) ? { trabajador: { company: companyScope(s) } } : {};
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
