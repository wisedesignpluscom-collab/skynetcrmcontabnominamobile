import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/session";
import { estadoLicencia } from "@/lib/licencia/estado";

export default async function CrmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSession();

  // La licencia se comprueba aquí y no en proxy.ts porque el middleware corre en
  // el runtime Edge, sin acceso al hardware ni al sistema de archivos. Todo el
  // CRM pasa por este layout, así que ninguna página se salta la comprobación.
  const licencia = estadoLicencia();
  if (!licencia.operativo) redirect("/licencia");

  return (
    <>
      <Sidebar userName={user?.name ?? ""} userRole={user?.role ?? ""} />
      <main className="min-h-screen px-4 pb-8 pt-20 lg:ml-60 lg:px-8 lg:pt-8">
        {licencia.estado !== "valida" && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">Licencia pendiente</p>
            <p className="mt-0.5 text-sm text-amber-800">{licencia.motivo}</p>
          </div>
        )}
        {children}
      </main>
    </>
  );
}
