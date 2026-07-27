// Una fila de la bandeja de casos: semáforo por proximidad al vencimiento,
// avance de estado en un clic y detalle desplegable con los hitos del ciclo.
// El <details> nativo evita convertir la lista en componente cliente.

import Link from "next/link";
import {
  cambiarEstadoCaso,
  presentarCaso,
  actualizarCaso,
} from "@/app/(crm)/casos/actions";
import {
  CAUSAS_ATRASO,
  causaAtrasoLabels,
  diasHasta,
  estadoCasoLabels,
  estadoCasoClass,
  semaforoClass,
  semaforoLabels,
  siguienteEstadoCaso,
  type Semaforo,
} from "@/lib/casos";
import { etiquetaPeriodo } from "@/lib/fiscal/vencimientos";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });

const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export type CasoData = {
  id: string;
  periodoFiscal: string;
  estado: string;
  fechaLimite: Date | null;
  fechaSolicitudSoportes: Date | null;
  fechaPresentacion: Date | null;
  evidenciaUrl: string | null;
  causaAtraso: string | null;
  notas: string | null;
  analistaId: string | null;
  supervisorId: string | null;
  analistaNombre: string | null;
  companyId: string;
  companyName: string;
  obligacionNombre: string;
  enteReceptor: string;
};

// Cuánto falta (o cuánto se pasó), en palabras
function textoPlazo(fechaLimite: Date | null, estado: string): string {
  if (estado === "presentado") return "Cerrado";
  if (!fechaLimite) return "Sin fecha límite";
  const dias = diasHasta(fechaLimite);
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  if (dias > 0) return `Faltan ${dias} días`;
  return dias === -1 ? "Venció ayer" : `Venció hace ${Math.abs(dias)} días`;
}

export default function CasoRow({
  caso,
  semaforo,
  usuarios,
  puedeReasignar,
}: {
  caso: CasoData;
  semaforo: Semaforo;
  usuarios: { id: string; name: string }[];
  puedeReasignar: boolean;
}) {
  const siguiente = siguienteEstadoCaso(caso.estado);
  const vaAPresentar = siguiente === "presentado";

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span
          className={`h-3 w-3 shrink-0 rounded-full ${semaforoClass[semaforo]}`}
          title={semaforoLabels[semaforo]}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {caso.obligacionNombre}
            <span className="font-normal text-slate-400"> · {caso.enteReceptor}</span>
          </p>
          <p className="truncate text-xs text-slate-500">
            <Link href={`/empresas/${caso.companyId}`} className="hover:text-teal-700 hover:underline">
              {caso.companyName}
            </Link>
            {" · "}
            {etiquetaPeriodo(caso.periodoFiscal)}
            {caso.analistaNombre && ` · ${caso.analistaNombre}`}
          </p>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-slate-700">
            {caso.fechaLimite ? fechaCorta(caso.fechaLimite) : "—"}
          </p>
          <p className="text-xs text-slate-400">{textoPlazo(caso.fechaLimite, caso.estado)}</p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            estadoCasoClass[caso.estado] ?? "bg-slate-100 text-slate-600"
          }`}
        >
          {estadoCasoLabels[caso.estado] ?? caso.estado}
        </span>

        {siguiente && !vaAPresentar && (
          <form action={cambiarEstadoCaso}>
            <input type="hidden" name="id" value={caso.id} />
            <input type="hidden" name="estado" value={siguiente} />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100"
            >
              {estadoCasoLabels[siguiente]} →
            </button>
          </form>
        )}
      </div>

      <details className="border-t border-slate-100">
        <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700">
          Detalle del caso
        </summary>

        <div className="space-y-4 px-4 pb-4">
          {vaAPresentar ? (
            <form action={presentarCaso} className="grid gap-2 rounded-lg border border-teal-100 bg-teal-50/40 p-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={caso.id} />
              <label className="sm:col-span-1">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Presentado el
                </span>
                <input
                  name="fechaPresentacion"
                  type="date"
                  defaultValue={toDateInput(caso.fechaPresentacion) || toDateInput(new Date())}
                  className={`${inputClass} w-full`}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Comprobante (enlace)
                </span>
                <input
                  name="evidenciaUrl"
                  defaultValue={caso.evidenciaUrl ?? ""}
                  placeholder="https://…"
                  className={`${inputClass} w-full`}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Causa del atraso
                </span>
                <select name="causaAtraso" defaultValue={caso.causaAtraso ?? ""} className={`${inputClass} w-full`}>
                  <option value="">Sin atraso</option>
                  {CAUSAS_ATRASO.map((c) => (
                    <option key={c} value={c}>
                      {causaAtrasoLabels[c]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-4">
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  Marcar como presentado
                </button>
                <span className="ml-3 text-xs text-slate-500">
                  Al presentarlo se abre el caso del período siguiente.
                </span>
              </div>
            </form>
          ) : (
            caso.estado === "presentado" && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Presentado{caso.fechaPresentacion && ` el ${fechaCorta(caso.fechaPresentacion)}`}
                {caso.evidenciaUrl && (
                  <>
                    {" · "}
                    <a href={caso.evidenciaUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      ver comprobante
                    </a>
                  </>
                )}
                {caso.causaAtraso && ` · ${causaAtrasoLabels[caso.causaAtraso]}`}
              </p>
            )
          )}

          <form action={actualizarCaso} className="grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="id" value={caso.id} />
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Fecha límite
              </span>
              <input
                name="fechaLimite"
                type="date"
                defaultValue={toDateInput(caso.fechaLimite)}
                className={`${inputClass} w-full`}
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Soportes pedidos el
              </span>
              <input
                name="fechaSolicitudSoportes"
                type="date"
                defaultValue={toDateInput(caso.fechaSolicitudSoportes)}
                className={`${inputClass} w-full`}
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Analista
              </span>
              <select
                name="analistaId"
                defaultValue={caso.analistaId ?? ""}
                disabled={!puedeReasignar}
                className={`${inputClass} w-full disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
              >
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Supervisor
              </span>
              <select
                name="supervisorId"
                defaultValue={caso.supervisorId ?? ""}
                disabled={!puedeReasignar}
                className={`${inputClass} w-full disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
              >
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <select
              name="causaAtraso"
              defaultValue={caso.causaAtraso ?? ""}
              className={`${inputClass} sm:col-span-1`}
              aria-label="Causa del atraso"
            >
              <option value="">Sin atraso</option>
              {CAUSAS_ATRASO.map((c) => (
                <option key={c} value={c}>
                  {causaAtrasoLabels[c]}
                </option>
              ))}
            </select>
            <input
              name="notas"
              defaultValue={caso.notas ?? ""}
              placeholder="Notas del caso…"
              className={`${inputClass} sm:col-span-2`}
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
            >
              Guardar
            </button>
          </form>
        </div>
      </details>
    </li>
  );
}
