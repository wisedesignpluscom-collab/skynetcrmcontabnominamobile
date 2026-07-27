import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOptions } from "@/lib/catalog";
import { getSession } from "@/lib/session";
import { canReassign } from "@/lib/permissions";
import { canAccessCompany } from "@/lib/ownership";
import { loadRules } from "@/lib/engine/load";
import { FORM_CHANGE_TRIGGER } from "@/lib/engine/formRules";
import ClienteForm from "@/components/forms/ClienteForm";

export const dynamic = "force-dynamic";

export default async function EditarEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  const [company, industries, municipios, regimenes, tamanos, users, rules] =
    await Promise.all([
      prisma.company.findUnique({ where: { id } }),
      getOptions("industry"),
      getOptions("municipio"),
      getOptions("regimen_tributario"),
      getOptions("tamano_empresa"),
      prisma.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true },
      }),
      loadRules({ module: "company", trigger: FORM_CHANGE_TRIGGER }),
    ]);

  if (!company) notFound();
  // El analista no edita clientes ajenos (protección de URL directa)
  if (!(await canAccessCompany(session, id))) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link
          href={`/empresas/${id}`}
          className="text-sm font-medium text-teal-600 hover:underline"
        >
          ← Volver al cliente
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Editar cliente</h1>
        <p className="text-sm text-slate-500">{company.name}</p>
      </header>

      <ClienteForm
        company={company}
        industries={industries.map((i) => i.label)}
        municipios={municipios.map((m) => m.label)}
        regimenes={regimenes.map((r) => r.label)}
        tamanos={tamanos.map((t) => t.label)}
        users={users}
        rules={rules}
        user={session ? { id: session.id, role: session.role } : null}
        puedeReasignar={canReassign(session?.role)}
      />
    </div>
  );
}
