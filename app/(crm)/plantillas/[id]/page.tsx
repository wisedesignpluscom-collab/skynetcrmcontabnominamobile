import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAutomations } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import TemplateEditor from "@/components/email/TemplateEditor";

export const dynamic = "force-dynamic";

export default async function EditarPlantillaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || !canManageAutomations(session.role)) redirect("/");

  const { id } = await params;
  const t = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!t) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <p className="text-xs text-slate-400">
          <Link href="/plantillas" className="hover:text-teal-600">
            Plantillas
          </Link>{" "}
          / Editar
        </p>
        <h1 className="text-2xl font-bold text-slate-900">{t.name}</h1>
      </header>
      <TemplateEditor
        templateId={t.id}
        initial={{
          name: t.name,
          description: t.description ?? "",
          module: t.module,
          subject: t.subject,
          bodyHtml: t.bodyHtml,
        }}
      />
    </div>
  );
}
