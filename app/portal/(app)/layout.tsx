import { redirect } from "next/navigation";
import PortalShell from "@/components/portal/PortalShell";
import { requirePortalUser } from "@/lib/portal";
import { contarNoLeidosPorCliente } from "@/lib/chat";
import { estadoLicencia } from "@/lib/licencia/estado";

export default async function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Misma comprobación que app/(crm)/layout.tsx: si la instalación no está
  // operativa, ningún sistema (interno ni portal) debe funcionar.
  const licencia = estadoLicencia();
  if (!licencia.operativo) redirect("/licencia");

  const auth = await requirePortalUser();
  if (auth.status === "anon" || auth.status === "blocked") redirect("/portal/login");

  const mensajesSinLeer = await contarNoLeidosPorCliente(auth.session.companyId);

  return (
    <PortalShell companyName={auth.companyName} userName={auth.session.name} mensajesSinLeer={mensajesSinLeer}>
      {children}
    </PortalShell>
  );
}
