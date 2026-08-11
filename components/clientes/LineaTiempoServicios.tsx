// Línea de tiempo de servicios (reemplaza la del pipeline de ventas en la
// ficha del cliente): un paso por cada obligación contratada del plan, en el
// orden del catálogo. A diferencia de un pipeline de ventas, estas
// obligaciones son INDEPENDIENTES entre sí (el IVA no espera a que termine el
// FAOV) — por eso cada paso muestra su propio estado (el de su CasoRecurrente
// más reciente) en vez de un único avance compartido. Se actualiza solo
// cuando el gestor avanza cualquiera de los casos.
import Link from "next/link";
import { estadoCasoLabels } from "@/lib/casos";
import { etiquetaPeriodo } from "@/lib/fiscal/vencimientos";

export type ServicioTimelineStep = {
  obligacionId: string;
  nombre: string;
  enteReceptor: string;
  // null = todavía no se ha abierto ningún caso de esta obligación
  estado: string | null;
  fechaLimite: Date | null;
  periodoFiscal: string | null;
};

const DOT_CLASS: Record<string, string> = {
  presentado: "bg-emerald-500 border-emerald-500",
  en_revision: "bg-amber-500 border-amber-500",
  en_proceso: "bg-teal-500 border-teal-500",
  pendiente_cliente: "bg-white border-slate-300",
  vencido: "bg-red-500 border-red-500",
};

const fechaCorta = (d: Date) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });

export default function LineaTiempoServicios({
  companyId,
  pasos,
}: {
  companyId: string;
  pasos: ServicioTimelineStep[];
}) {
  if (pasos.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">Línea de tiempo de servicios</h2>
          <p className="text-xs text-slate-400">
            En qué va cada servicio contratado — se actualiza al avanzar el caso correspondiente.
          </p>
        </div>
        <Link
          href={`/casos?empresa=${companyId}`}
          className="text-xs font-medium text-teal-600 hover:underline"
        >
          Ver todos los casos →
        </Link>
      </div>
      <div className="flex">
        {pasos.map((p, i) => (
          <div key={p.obligacionId} className="relative flex flex-1 flex-col items-center">
            {i > 0 && <span className="absolute left-0 right-1/2 top-[7px] h-0.5 bg-slate-200" />}
            {i < pasos.length - 1 && <span className="absolute left-1/2 right-0 top-[7px] h-0.5 bg-slate-200" />}
            <Link
              href={`/casos?empresa=${companyId}&ente=${encodeURIComponent(p.enteReceptor)}`}
              className="group relative z-10 flex flex-col items-center"
              title={p.nombre}
            >
              <span
                className={`h-4 w-4 rounded-full border-2 ${
                  p.estado ? DOT_CLASS[p.estado] ?? "bg-white border-slate-300" : "border-dashed border-slate-300 bg-white"
                }`}
              />
              <span className="mt-1.5 max-w-[100px] text-center text-[10px] leading-tight text-slate-600 group-hover:text-teal-700">
                {p.nombre}
              </span>
              <span className="mt-0.5 text-center text-[9px] font-medium text-slate-400">
                {p.estado ? estadoCasoLabels[p.estado] ?? p.estado : "Sin abrir"}
              </span>
              {p.periodoFiscal && (
                <span className="text-center text-[9px] text-slate-300">
                  {etiquetaPeriodo(p.periodoFiscal)}
                  {p.fechaLimite && ` · vence ${fechaCorta(p.fechaLimite)}`}
                </span>
              )}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
