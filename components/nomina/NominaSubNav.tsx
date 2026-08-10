"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación horizontal presente en toda la sección de nómina de un
// cliente. "Vista empleado" / "Mi panel" / "Marcar asistencia" / "Mis
// recibos" son autoservicio del trabajador (fuera del alcance 2.1-2.7 del
// analista) — quedan visibles per la especificación pero deshabilitadas
// hasta que el proyecto llegue a esa pieza.
export default function NominaSubNav({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const home = `/nomina/${companyId}`;
  const active = pathname === home;

  return (
    <nav className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
      <Link
        href={home}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          active ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        Nóminas
      </Link>
      <span className="mx-1 h-4 w-px bg-slate-200" />
      {["Vista empleado", "Mi panel", "Marcar asistencia", "Mis recibos"].map((label) => (
        <span
          key={label}
          title="Próximamente"
          className="cursor-not-allowed rounded-full px-4 py-1.5 text-sm font-medium text-slate-300"
        >
          {label}
        </span>
      ))}
    </nav>
  );
}
