import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { canAccessCompany } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";
import NominaSubNav from "@/components/nomina/NominaSubNav";

export default async function NominaClienteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const session = await getSession();
  const [permitido, company] = await Promise.all([
    canAccessCompany(session, companyId),
    prisma.company.findUnique({ where: { id: companyId }, select: { id: true } }),
  ]);
  if (!company || !permitido) notFound();

  return (
    <div className="space-y-5">
      <NominaSubNav companyId={companyId} />
      {children}
    </div>
  );
}
