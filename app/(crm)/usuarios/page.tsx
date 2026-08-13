import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { createUser, updatePassword, deleteUser, toggleUserActive } from "./actions";
import { roleLabels, ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/");

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const adminCount = users.filter((u) => u.role === "admin").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
        <p className="text-sm text-slate-500">
          Cuentas de acceso al CRM. Solo los administradores ven esta página.
        </p>
      </header>

      {/* Crear usuario */}
      <form
        action={createUser}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Nombre</label>
          <input name="name" required className={`${inputClass} w-full`} placeholder="María López" />
        </div>
        <div className="min-w-48 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
          <input
            name="email"
            type="email"
            required
            className={`${inputClass} w-full`}
            placeholder="maria@empresa.com"
          />
        </div>
        <div className="w-40">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Contraseña (mín. 6)
          </label>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className={`${inputClass} w-full`}
            placeholder="••••••"
          />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-slate-500">Rol</label>
          <select name="role" defaultValue="vendedor" className={`${inputClass} w-full`}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          Crear usuario
        </button>
      </form>

      {/* Lista */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Acceso</th>
              <th className="px-4 py-3 font-medium">Creado</th>
              <th className="px-4 py-3 font-medium">Nueva contraseña</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const isSelf = u.id === session.id;
              const isLastAdmin = u.role === "admin" && adminCount <= 1;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">
                        {u.name[0]?.toUpperCase()}
                      </span>
                      <div>
                        <p className="font-medium text-slate-800">
                          {u.name}
                          {isSelf && <span className="ml-1.5 text-xs text-teal-600">(tú)</span>}
                        </p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        u.role === "admin"
                          ? "bg-purple-50 text-purple-700"
                          : u.role === "supervisor"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {roleLabels[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isSelf || isLastAdmin ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          u.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {u.active ? "Activo" : "Inactivo"}
                      </span>
                    ) : (
                      <form action={toggleUserActive}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button
                          type="submit"
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            u.active
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-red-50 text-red-700 hover:bg-red-100"
                          }`}
                          title={u.active ? "Desactivar acceso" : "Reactivar acceso"}
                        >
                          {u.active ? "Activo" : "Inactivo"}
                        </button>
                      </form>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{dateFmt.format(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <form action={updatePassword} className="flex gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <input
                        name="password"
                        type="password"
                        minLength={6}
                        required
                        placeholder="••••••"
                        className={`${inputClass} w-28 px-2 py-1.5 text-xs`}
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                      >
                        Cambiar
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && !isLastAdmin && (
                      <form action={deleteUser}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button
                          type="submit"
                          title={`Eliminar a ${u.name}`}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        🔒 Protecciones: no puedes eliminar ni desactivar tu propia cuenta, ni la del último
        administrador. Desactivar corta el acceso de inmediato (sin esperar a que expire la sesión).
      </p>
    </div>
  );
}
