import Link from "next/link";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AutoRefresh from "@/components/AutoRefresh";
import { getSession } from "@/lib/session";
import { estadoLicencia } from "@/lib/licencia/estado";
import { companyScope } from "@/lib/permissions";
import { noLeidosPorStaffWhere } from "@/lib/chat";
import { prisma } from "@/lib/prisma";

export default async function CrmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSession();

  // Revocación de acceso: el JWT por sí solo no sabe si al usuario lo
  // desactivaron después de emitirlo (puede durar hasta 7 días). Se revisa
  // aquí — igual que la licencia — porque TODO el CRM pasa por este layout,
  // así que ninguna página se salta la comprobación. No se borra la cookie
  // aquí (un Server Component no puede: solo Server Actions/Route Handlers) —
  // basta con redirigir; la próxima carga vuelve a rechazarla igual, y el
  // logout normal ya la limpia cuando el usuario inicia sesión de nuevo.
  if (user) {
    const cuenta = await prisma.user.findUnique({
      where: { id: user.id },
      select: { active: true },
    });
    if (!cuenta || !cuenta.active) {
      redirect("/login");
    }
  }

  // La licencia se comprueba aquí y no en proxy.ts porque el middleware corre en
  // el runtime Edge, sin acceso al hardware ni al sistema de archivos. Todo el
  // CRM pasa por este layout, así que ninguna página se salta la comprobación.
  const licencia = estadoLicencia();
  if (!licencia.operativo) redirect("/licencia");

  // Mensajes del cliente sin leer, agrupados por empresa — se muestran en TODAS
  // las páginas del CRM (no solo en la campanita) porque son gestiones que un
  // analista/supervisor/gerente debe atender lo antes posible, no conversación
  // de fondo. Un mensaje por empresa (el más reciente) alcanza para priorizar.
  const mensajesPendientes = user
    ? await prisma.mensajeChat.findMany({
        where: noLeidosPorStaffWhere(companyScope(user)),
        orderBy: { createdAt: "desc" },
        distinct: ["companyId"],
        take: 5,
        include: { company: { select: { id: true, name: true } } },
      })
    : [];

  return (
    <>
      <Sidebar userName={user?.name ?? ""} userRole={user?.role ?? ""} />
      {/* Refresca el layout (y con él, el aviso de mensajes sin leer) cada 15s
          sin recargar la página ni perder en qué módulo está el usuario —
          mismo mecanismo que ya usa el portal de clientes, sin websockets. */}
      <AutoRefresh intervalMs={15000} />
      <main className="min-h-screen px-4 pb-8 pt-20 lg:ml-60 lg:px-8 lg:pt-8">
        {licencia.estado !== "valida" && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">Licencia pendiente</p>
            <p className="mt-0.5 text-sm text-amber-800">{licencia.motivo}</p>
          </div>
        )}
        {mensajesPendientes.map((m) => (
          <Link
            key={m.id}
            href={`/empresas/${m.companyId}#chat`}
            className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 shadow-sm transition hover:bg-teal-100"
          >
            <div>
              <p className="text-sm font-semibold text-teal-900">
                💬 Mensaje nuevo de {m.company.name}
              </p>
              <p className="mt-0.5 line-clamp-1 text-sm text-teal-800">{m.contenido}</p>
            </div>
            <span className="mt-0.5 shrink-0 text-sm font-semibold text-teal-700">
              Ver conversación →
            </span>
          </Link>
        ))}
        {children}
      </main>
    </>
  );
}
