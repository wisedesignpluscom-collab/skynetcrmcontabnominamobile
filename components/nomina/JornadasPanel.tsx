import { crearJornada, actualizarJornada, eliminarJornada } from "@/app/(crm)/nomina/[companyId]/configuracion/actions";
import {
  METODOS_JORNADA,
  metodoJornadaLabels,
  DIAS_SEMANA,
  diaSemanaLabels,
  PRESETS_DIAS,
  horasEfectivas,
} from "@/lib/jornadas";
import { parseMulti } from "@/lib/multivalor";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export type JornadaRow = {
  id: string;
  nombre: string;
  horaEntrada: string;
  horaSalida: string;
  descansoMinutos: number;
  metodo: string;
  toleranciaMinutos: number | null;
  umbralMedioDiaHoras: number | null;
  nocturna: boolean;
  diasOperacion: string | null;
};

function CamposJornada({ j }: { j?: JornadaRow }) {
  const diasActivos = new Set(parseMulti(j?.diasOperacion));
  return (
    <>
      <label className="text-xs font-medium text-slate-500">
        Nombre
        <input name="nombre" defaultValue={j?.nombre} required className={`${inputClass} mt-1 w-full`} />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Método
        <select name="metodo" defaultValue={j?.metodo ?? "fija"} className={`${inputClass} mt-1 w-full`}>
          {METODOS_JORNADA.map((m) => (
            <option key={m} value={m}>
              {metodoJornadaLabels[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-500">
        Entrada
        <input name="horaEntrada" type="time" defaultValue={j?.horaEntrada} required className={`${inputClass} mt-1 w-full`} />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Salida
        <input name="horaSalida" type="time" defaultValue={j?.horaSalida} required className={`${inputClass} mt-1 w-full`} />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Descanso (min, no remunerado)
        <input
          name="descansoMinutos"
          type="number"
          min="0"
          defaultValue={j?.descansoMinutos ?? 0}
          className={`${inputClass} mt-1 w-full`}
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Tolerancia (min)
        <input
          name="toleranciaMinutos"
          type="number"
          min="0"
          defaultValue={j?.toleranciaMinutos ?? ""}
          className={`${inputClass} mt-1 w-full`}
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Umbral medio día (horas)
        <input
          name="umbralMedioDiaHoras"
          type="number"
          min="0"
          step="0.5"
          defaultValue={j?.umbralMedioDiaHoras ?? ""}
          className={`${inputClass} mt-1 w-full`}
        />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium text-slate-500">
        <input type="checkbox" name="nocturna" defaultChecked={j?.nocturna} className="h-4 w-4" />
        Jornada nocturna
      </label>

      <div className="sm:col-span-4">
        <p className="mb-1 text-xs font-medium text-slate-500">Días de operación</p>
        <div className="flex flex-wrap items-center gap-3">
          {DIAS_SEMANA.map((d) => (
            <label key={d} className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" name="dias" value={d} defaultChecked={diasActivos.has(d)} className="h-3.5 w-3.5" />
              {d}
            </label>
          ))}
          <span className="text-slate-300">·</span>
          {Object.keys(PRESETS_DIAS).map((preset) => (
            <span key={preset} className="text-[11px] text-slate-400" title={PRESETS_DIAS[preset].join(", ")}>
              {preset}
            </span>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Presets de referencia — marca las casillas correspondientes ({diaSemanaLabels.L}-{diaSemanaLabels.V} = L,M,X,J,V).
        </p>
      </div>
    </>
  );
}

export default function JornadasPanel({
  companyId,
  jornadas,
  puedeEliminar,
}: {
  companyId: string;
  jornadas: JornadaRow[];
  puedeEliminar: boolean;
}) {
  return (
    <div className="space-y-5">
      <details className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700 hover:text-teal-700">
          + Nueva jornada
        </summary>
        <form action={crearJornada} className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-4">
          <input type="hidden" name="companyId" value={companyId} />
          <CamposJornada />
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 sm:col-span-4 sm:w-fit"
          >
            Crear jornada
          </button>
        </form>
      </details>

      {jornadas.length === 0 ? (
        <p className="text-sm text-slate-400">Sin jornadas registradas todavía.</p>
      ) : (
        <ul className="space-y-2">
          {jornadas.map((j) => {
            const horas = horasEfectivas(j.horaEntrada, j.horaSalida, j.descansoMinutos);
            const dias = parseMulti(j.diasOperacion).join(", ");
            return (
              <li key={j.id} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{j.nombre}</span>
                    <span className="text-xs text-slate-400">
                      {j.horaEntrada}–{j.horaSalida}
                      {j.nocturna && " · nocturna"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {horas != null ? `${horas.toFixed(2)} h efectivas` : "—"}
                    </span>
                  </span>
                  {puedeEliminar && (
                    <form action={eliminarJornada}>
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="id" value={j.id} />
                      <button type="submit" className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline">
                        Eliminar
                      </button>
                    </form>
                  )}
                </div>
                {dias && <p className="mb-2 text-xs text-slate-400">Días: {dias}</p>}

                <details>
                  <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-teal-700">
                    Editar jornada
                  </summary>
                  <form action={actualizarJornada} className="mt-2 grid gap-3 sm:grid-cols-4">
                    <input type="hidden" name="companyId" value={companyId} />
                    <input type="hidden" name="id" value={j.id} />
                    <CamposJornada j={j} />
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 sm:col-span-4 sm:w-fit"
                    >
                      Guardar
                    </button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
