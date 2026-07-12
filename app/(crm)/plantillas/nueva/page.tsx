import Link from "next/link";
import { getSession } from "@/lib/session";
import { canManageAutomations } from "@/lib/permissions";
import { redirect } from "next/navigation";
import TemplateEditor from "@/components/email/TemplateEditor";

export const dynamic = "force-dynamic";

const bodyEjemplo =
  "<p>Hola {firstName},</p><p>Gracias por confiar en nosotros. Te escribimos para…</p><p>Saludos,<br>El equipo</p>";

export default async function NuevaPlantillaPage() {
  const session = await getSession();
  if (!session || !canManageAutomations(session.role)) redirect("/");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <p className="text-xs text-slate-400">
          <Link href="/plantillas" className="hover:text-teal-600">
            Plantillas
          </Link>{" "}
          / Nueva
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Nueva plantilla</h1>
      </header>
      <TemplateEditor
        templateId={null}
        initial={{
          name: "",
          description: "",
          module: "contact",
          subject: "",
          bodyHtml: bodyEjemplo,
        }}
      />
    </div>
  );
}
