import { requirePortalUser } from "@/lib/portal";
import { redirect } from "next/navigation";
import CambiarPasswordForm from "./cambiar-password-form";

export const dynamic = "force-dynamic";

export default async function PortalCuentaPage() {
  const auth = await requirePortalUser();
  if (auth.status === "anon" || auth.status === "blocked") redirect("/portal/login");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Mi cuenta</h1>
        <p className="text-sm text-slate-500">
          {auth.session.name} · {auth.session.email}
        </p>
      </header>

      {auth.status === "must_change_password" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">Cambia tu contraseña para continuar</p>
          <p className="mt-0.5 text-sm text-amber-800">
            Tu gestor te asignó una contraseña temporal. Por seguridad, debes elegir una propia
            antes de ver el estatus de tus gestiones.
          </p>
        </div>
      )}

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold text-slate-900">Cambiar contraseña</h2>
        <CambiarPasswordForm />
      </section>
    </div>
  );
}
