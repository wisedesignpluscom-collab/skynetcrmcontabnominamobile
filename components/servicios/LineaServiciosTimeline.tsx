// Línea de tiempo horizontal de servicios contratados — mismo estilo visual
// (nodos conectados por una línea) que tenía la línea de tiempo del pipeline
// que reemplaza, pero cada nodo es un servicio/obligación contratado en vez
// de una etapa de venta. La comparten la ficha del cliente (CRM interno) y el
// dashboard del portal — un cliente ve exactamente lo mismo que ve su gestor.
// Presentacional puro (sin hooks): funciona igual como Server o Client Component.
import type { ItemLineaServicio, ColorServicio } from "@/lib/serviciosTimeline";

const colorPunto: Record<ColorServicio, string> = {
  verde: "#10b981",
  naranja: "#f59e0b",
  gris: "#cbd5e1",
};

export function LeyendaLineaServicios() {
  return (
    <p className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
      <span>Obligaciones del plan (período en curso) y servicios individuales contratados.</span>
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Culminado
      </span>
      <span className="inline-flex items-center gap-1 text-amber-600">
        <span className="h-2 w-2 rounded-full bg-amber-500" /> Pendiente
      </span>
      <span className="inline-flex items-center gap-1 text-slate-400">
        <span className="h-2 w-2 rounded-full bg-slate-300" /> Sin comenzar
      </span>
    </p>
  );
}

export default function LineaServiciosTimeline({ items }: { items: ItemLineaServicio[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
        Todavía no hay servicios contratados.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max">
        {items.map((item, i) => (
          <div key={item.id} className="relative flex w-32 shrink-0 flex-col items-center px-1">
            {i > 0 && <span className="absolute left-0 right-1/2 top-[7px] h-0.5 bg-slate-200" />}
            {i < items.length - 1 && (
              <span className="absolute left-1/2 right-0 top-[7px] h-0.5 bg-slate-200" />
            )}
            <span
              className="relative z-10 h-4 w-4 shrink-0 rounded-full border-2"
              style={{ backgroundColor: colorPunto[item.color], borderColor: colorPunto[item.color] }}
            />
            <span className="mt-1.5 text-center text-[10px] font-medium leading-tight text-slate-700">
              {item.nombre}
            </span>
            <span className="text-center text-[9px] leading-tight text-slate-400">{item.detalle}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
