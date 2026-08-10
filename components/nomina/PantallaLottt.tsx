import Link from "next/link";

// Patrón compartido por Vacaciones, Utilidades y Liquidaciones (2.6): header
// con referencia legal + "Ver lógica de cálculo", acción principal, y el
// contenido (tabla o estado vacío) que pasa cada pantalla.
export default function PantallaLottt({
  companyId,
  titulo,
  articulo,
  logicaCalculo,
  accionPrincipal,
  children,
}: {
  companyId: string;
  titulo: string;
  articulo: string;
  logicaCalculo: React.ReactNode;
  accionPrincipal: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/nomina/${companyId}`} className="text-xs font-medium text-slate-400 hover:text-teal-700 hover:underline">
              ← Volver a Nómina
            </Link>
            <h1 className="mt-1 text-xl font-bold text-slate-900">{titulo}</h1>
            <p className="text-sm text-slate-500">
              LOTTT · Venezuela <span className="text-slate-300">·</span> {articulo}
            </p>
          </div>
          {accionPrincipal}
        </div>

        <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-amber-800">
            Ver lógica de cálculo
          </summary>
          <div className="space-y-1.5 border-t border-amber-200 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
            {logicaCalculo}
          </div>
        </details>
      </div>

      {children}
    </div>
  );
}
