// Fila de la bandeja /riesgo-nomina. Reutiliza las mismas server actions de
// la ficha del cliente (empresas/nomina-actions.ts) — una sola fuente de
// verdad para el ciclo de vida de la declaración, sin duplicar lógica.

import Link from "next/link";
import {
  avanzarEstadoDeclaracion,
  resolverBloqueo,
} from "@/app/(crm)/empresas/nomina-actions";
import {
  estadoDeclaracionLabels,
  estadoDeclaracionClass,
  siguienteEstadoDeclaracion,
  ESTADO_BLOQUEADA,
} from "@/lib/nomina";
import { etiquetaPeriodo } from "@/lib/fiscal/vencimientos";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const money = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 });

export default function DeclaracionRiesgoRow({
  companyId,
  companyName,
  analistaNombre,
  trabajadorId,
  trabajadorNombre,
  trabajadorCedula,
  periodo,
  baseDeclarada,
  estado,
  riesgo,
  motivos,
  notaRiesgo,
  puedeAprobar,
}: {
  companyId: string;
  companyName: string;
  analistaNombre: string | null;
  trabajadorId: string;
  trabajadorNombre: string;
  trabajadorCedula: string;
  periodo: string;
  baseDeclarada: number;
  estado: string;
  riesgo: boolean;
  motivos: string[];
  notaRiesgo: string | null;
  puedeAprobar: boolean;
}) {
  const siguiente = estado !== ESTADO_BLOQUEADA ? siguienteEstadoDeclaracion(estado) : null;
  const bloquearia = riesgo && siguiente === "aprobada";
  const puedeAvanzar = !!siguiente && (siguiente !== "aprobada" || bloquearia || puedeAprobar);
  const etiquetaBoton = !siguiente
    ? null
    : bloquearia
      ? "Enviar a revisión de riesgo →"
      : `Pasar a ${estadoDeclaracionLabels[siguiente].toLowerCase()} →`;

  return (
    <li className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoDeclaracionClass[estado] ?? "bg-slate-100 text-slate-600"}`}
          >
            {estadoDeclaracionLabels[estado] ?? estado}
          </span>
          {riesgo && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
              ⚠ {motivos.join(" · ") || "En riesgo"}
            </span>
          )}
          <Link
            href={`/empresas/${companyId}`}
            className="text-sm font-medium text-slate-800 hover:text-teal-700 hover:underline"
          >
            {companyName}
          </Link>
          <span className="text-xs text-slate-400">
            {trabajadorNombre} · {trabajadorCedula}
          </span>
        </span>
        <span className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">{analistaNombre ?? "Sin analista"}</span>
          <span className="font-semibold text-slate-700">Bs {money.format(baseDeclarada)}</span>
          {puedeAvanzar && etiquetaBoton && (
            <form action={avanzarEstadoDeclaracion}>
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="trabajadorId" value={trabajadorId} />
              <input type="hidden" name="periodo" value={periodo} />
              <button
                type="submit"
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  bloquearia ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-teal-50 text-teal-700 hover:bg-teal-100"
                }`}
              >
                {etiquetaBoton}
              </button>
            </form>
          )}
        </span>
      </div>

      {notaRiesgo && (
        <p className="mt-2 rounded-lg bg-red-50/60 p-2 text-xs text-red-700">
          <span className="font-semibold">Nota: </span>
          {notaRiesgo}
        </p>
      )}

      {estado === ESTADO_BLOQUEADA && puedeAprobar && (
        <form
          action={resolverBloqueo}
          className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-red-100 bg-red-50/40 p-2"
        >
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="trabajadorId" value={trabajadorId} />
          <input type="hidden" name="periodo" value={periodo} />
          <label className="flex-1 text-xs text-red-700">
            Resolver bloqueo (nota obligatoria)
            <input
              name="notaResolucion"
              required
              placeholder="Ej.: se corrigió la base con el cliente, queda conforme…"
              className={`${inputClass} mt-1 block w-full`}
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Resolver
          </button>
        </form>
      )}

      <p className="mt-1 text-[11px] text-slate-400">{etiquetaPeriodo(periodo)}</p>
    </li>
  );
}
