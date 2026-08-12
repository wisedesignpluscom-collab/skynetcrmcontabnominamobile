// Panel de la ficha del cliente para gestionar quién de esa empresa puede
// entrar al portal (app/portal/*). Sin estado de cliente: todas las mutaciones
// van por Server Actions (app/(crm)/empresas/portal-actions.ts), mismo patrón
// que PlanServicioPanel/ServiciosPanel.

import {
  crearPortalUser,
  toggleActivoPortalUser,
  resetPasswordPortalUser,
} from "@/app/(crm)/empresas/portal-actions";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const fecha = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

export type PortalUserData = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastLoginAt: Date | null;
};

export default function PortalAccessPanel({
  companyId,
  usuarios,
}: {
  companyId: string;
  usuarios: PortalUserData[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-900">Acceso al portal de clientes</h2>
      <p className="mb-4 text-xs text-slate-400">
        Credenciales para que este cliente entre a ver el estatus de sus gestiones en modo solo
        lectura, en un sistema separado del CRM interno.
      </p>

      {usuarios.length > 0 && (
        <ul className="mb-5 space-y-2">
          {usuarios.map((u) => (
            <li key={u.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{u.name}</p>
                  <p className="truncate text-xs text-slate-500">{u.email}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    u.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {u.active ? "Activo" : "Desactivado"}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {u.lastLoginAt ? `Último ingreso: ${fecha.format(u.lastLoginAt)}` : "Nunca ha ingresado"}
                </span>
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-teal-600 hover:underline">
                  Gestionar
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-white p-3">
                  <form action={toggleActivoPortalUser}>
                    <input type="hidden" name="companyId" value={companyId} />
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="activar" value={u.active ? "0" : "1"} />
                    <button
                      type="submit"
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        u.active
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {u.active ? "Desactivar acceso" : "Reactivar acceso"}
                    </button>
                  </form>
                  <form action={resetPasswordPortalUser} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="companyId" value={companyId} />
                    <input type="hidden" name="id" value={u.id} />
                    <input
                      name="password"
                      type="password"
                      placeholder="Nueva contraseña temporal"
                      minLength={8}
                      required
                      className={inputClass}
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      Restablecer clave
                    </button>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-teal-600 hover:underline">
          + Dar acceso a una persona del cliente
        </summary>
        <form action={crearPortalUser} className="mt-3 grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="companyId" value={companyId} />
          <input name="name" placeholder="Nombre" required className={inputClass} />
          <input name="email" type="email" placeholder="Email" required className={inputClass} />
          <input
            name="password"
            type="password"
            placeholder="Contraseña inicial (mín. 8)"
            minLength={8}
            required
            className={inputClass}
          />
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Crear acceso
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          La contraseña es temporal: el cliente debe cambiarla al ingresar por primera vez.
        </p>
      </details>
    </section>
  );
}
