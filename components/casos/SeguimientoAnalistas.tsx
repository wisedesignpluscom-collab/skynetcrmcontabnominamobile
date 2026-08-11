// Panel de supervisión (Etapa 3 «Mis Consultores»): casos abiertos por
// analista y cuántos llevan más de N días sin que se complete ninguna
// sub-fase — para que un supervisor pueda dar seguimiento aunque el
// analista no avise. Solo visible para quien puede reasignar (admin/
// supervisor, mismo guard que el resto de la bandeja).
import Link from "next/link";

export default function SeguimientoAnalistas({
  analistas,
  umbral,
}: {
  analistas: { id: string; nombre: string; abiertos: number; estancados: number }[];
  umbral: number;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Seguimiento por analista</h2>
        <p className="text-xs text-slate-400">Estancado = {umbral}+ días sin completar ninguna sub-fase</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {analistas.map((a) => (
          <li key={a.id}>
            <Link
              href={`/casos?analista=${a.id}${a.estancados > 0 ? "&estancado=1" : ""}`}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                a.estancados > 0
                  ? "border-amber-200 bg-amber-50 hover:border-amber-300"
                  : "border-slate-100 bg-slate-50 hover:border-slate-200"
              }`}
            >
              <span className="font-medium text-slate-700">{a.nombre}</span>
              <span className="text-xs text-slate-500">
                {a.abiertos} abierto{a.abiertos === 1 ? "" : "s"}
                {a.estancados > 0 && (
                  <span className="ml-2 font-semibold text-amber-700">· {a.estancados} estancado{a.estancados === 1 ? "" : "s"}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
