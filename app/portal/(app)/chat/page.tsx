import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalUser, portalCompanyScope } from "@/lib/portal";
import ChatPanel from "@/components/portal/ChatPanel";

export const dynamic = "force-dynamic";

export default async function PortalChatPage() {
  const auth = await requirePortalUser();
  if (auth.status === "anon" || auth.status === "blocked") redirect("/portal/login");
  if (auth.status === "must_change_password") redirect("/portal/cuenta");

  const [company, mensajes] = await Promise.all([
    prisma.company.findUnique({
      where: { id: auth.session.companyId },
      select: { analista: { select: { name: true } }, supervisor: { select: { name: true } } },
    }),
    prisma.mensajeChat.findMany({
      where: portalCompanyScope(auth.session),
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, contenido: true, createdAt: true, autorTipo: true },
    }),
  ]);

  const gestorNombre = company?.analista?.name ?? company?.supervisor?.name ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Chat</h1>
        <p className="text-sm text-slate-500">Habla directamente con tu gestor asignado.</p>
      </header>

      <ChatPanel mensajes={mensajes} gestorNombre={gestorNombre} />
    </div>
  );
}
