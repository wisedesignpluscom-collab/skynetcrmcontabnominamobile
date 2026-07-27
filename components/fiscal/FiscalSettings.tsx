// Panel de Configuración del motor de vencimientos (F2): catálogo de
// obligaciones, calendario del SENIAT del año y días no hábiles.
// Server Component con formularios que llaman a las server actions, igual que
// la sección «Servicios y precios».

import {
  addObligacion,
  updateObligacion,
  toggleObligacion,
  saveCalendarioSeniat,
  addDiaNoHabil,
  deleteDiaNoHabil,
} from "@/app/(crm)/configuracion/fiscal-actions";
import {
  PERIODICIDADES,
  REGLAS_VENCIMIENTO,
  ENTES,
  claveDia,
  etiquetaPeriodo,
} from "@/lib/fiscal/vencimientos";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export type ObligacionRow = {
  id: string;
  nombre: string;
  jurisdiccion: string;
  periodicidad: string;
  enteReceptor: string;
  reglaTipo: string;
  reglaParam: number | null;
  municipio: string | null;
  notas: string | null;
  active: boolean;
  // Cómo queda su próxima fecha límite con los datos cargados hoy
  vistaPrevia: { periodo: string; fecha: Date | null; motivo?: string };
};

export type FeriadoRow = { id: string; fecha: Date; motivo: string; municipio: string };

const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });

export default function FiscalSettings({
  obligaciones,
  municipios,
  calendario,
  anioCalendario,
  feriados,
}: {
  obligaciones: ObligacionRow[];
  municipios: string[];
  // Día del mes por dígito del RIF (índice 0-9); null = sin cargar
  calendario: (number | null)[];
  anioCalendario: number;
  feriados: FeriadoRow[];
}) {
  const cargados = calendario.filter((d) => d !== null).length;

  return (
    <>
      {/* ── Obligaciones ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Obligaciones fiscales</h2>
        <p className="mb-4 text-xs text-slate-400">
          Qué se declara, ante quién, cada cuánto y cómo se calcula la fecha límite. El plan de
          servicios de cada cliente elige de este catálogo.
        </p>

        <form action={addObligacion} className="mb-5 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-6">
          <input
            name="nombre"
            required
            placeholder="Nueva obligación…"
            className={`${inputClass} sm:col-span-3`}
          />
          <select name="enteReceptor" defaultValue="SENIAT" className={inputClass} aria-label="Ente receptor">
            {ENTES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <select name="periodicidad" defaultValue="mensual" className={inputClass} aria-label="Periodicidad">
            {PERIODICIDADES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <select name="jurisdiccion" defaultValue="nacional" className={inputClass} aria-label="Jurisdicción">
            <option value="nacional">Nacional</option>
            <option value="municipal">Municipal</option>
          </select>
          <select name="reglaTipo" defaultValue="dia_fijo" className={`${inputClass} sm:col-span-3`} aria-label="Regla de vencimiento">
            {REGLAS_VENCIMIENTO.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            name="reglaParam"
            type="number"
            min="1"
            max="31"
            placeholder="N"
            className={inputClass}
            aria-label="Número de la regla"
          />
          <select name="municipio" defaultValue="" className={inputClass} aria-label="Municipio">
            <option value="">Municipio…</option>
            {municipios.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            + Agregar
          </button>
        </form>

        <ul className="space-y-2">
          {obligaciones.map((o) => (
            <li
              key={o.id}
              className={`rounded-lg border border-slate-100 p-3 ${o.active ? "" : "opacity-60"}`}
            >
              <form action={updateObligacion} className="grid gap-2 sm:grid-cols-6">
                <input type="hidden" name="id" value={o.id} />
                <input name="nombre" defaultValue={o.nombre} className={`${inputClass} sm:col-span-3`} />
                <select name="enteReceptor" defaultValue={o.enteReceptor} className={inputClass}>
                  {ENTES.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                <select name="periodicidad" defaultValue={o.periodicidad} className={inputClass}>
                  {PERIODICIDADES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select name="jurisdiccion" defaultValue={o.jurisdiccion} className={inputClass}>
                  <option value="nacional">Nacional</option>
                  <option value="municipal">Municipal</option>
                </select>
                <select name="reglaTipo" defaultValue={o.reglaTipo} className={`${inputClass} sm:col-span-3`}>
                  {REGLAS_VENCIMIENTO.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <input
                  name="reglaParam"
                  type="number"
                  min="1"
                  max="31"
                  defaultValue={o.reglaParam ?? ""}
                  placeholder="N"
                  className={inputClass}
                />
                <select name="municipio" defaultValue={o.municipio ?? ""} className={inputClass}>
                  <option value="">Municipio…</option>
                  {municipios.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Guardar
                </button>
                <input
                  name="notas"
                  defaultValue={o.notas ?? ""}
                  placeholder="Notas para el analista…"
                  className={`${inputClass} sm:col-span-6`}
                />
              </form>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <p className="text-slate-500">
                  <span className="font-medium text-slate-600">
                    {etiquetaPeriodo(o.vistaPrevia.periodo)}
                  </span>{" "}
                  vence{" "}
                  {o.vistaPrevia.fecha ? (
                    <span className="font-semibold text-teal-700">
                      {fechaCorta(o.vistaPrevia.fecha)}
                    </span>
                  ) : (
                    <span className="text-amber-700">{o.vistaPrevia.motivo}</span>
                  )}
                </p>
                <form action={toggleObligacion}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="active" value={o.active ? "false" : "true"} />
                  <button type="submit" className="font-medium text-slate-500 hover:underline">
                    {o.active ? "Desactivar" : "Activar"}
                  </button>
                </form>
              </div>
            </li>
          ))}
          {obligaciones.length === 0 && (
            <li className="text-sm text-slate-400">Sin obligaciones en el catálogo.</li>
          )}
        </ul>
      </section>

      {/* ── Calendario del SENIAT ──────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Calendario del SENIAT {anioCalendario}</h2>
        <p className="mb-4 text-xs text-slate-400">
          Día del mes que le toca a cada terminación de RIF según la providencia de sujetos pasivos
          especiales. Se carga una vez al año.
        </p>

        {cargados === 0 && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Sin cargar. Mientras tanto, las obligaciones «según terminación del RIF» le piden la
            fecha al analista en lugar de calcularla.
          </p>
        )}

        <form action={saveCalendarioSeniat} className="space-y-3">
          <input type="hidden" name="anio" value={anioCalendario} />
          <input type="hidden" name="periodicidad" value="mensual" />
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {calendario.map((dia, digito) => (
              <label key={digito} className="text-center">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  RIF …{digito}
                </span>
                <input
                  name={`dia_${digito}`}
                  type="number"
                  min="1"
                  max="31"
                  defaultValue={dia ?? ""}
                  placeholder="—"
                  className={`${inputClass} w-full text-center`}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {cargados}/10 terminaciones cargadas. Dejar en blanco borra la del dígito.
            </p>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Guardar calendario
            </button>
          </div>
        </form>
      </section>

      {/* ── Días no hábiles ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Días no hábiles</h2>
        <p className="mb-4 text-xs text-slate-400">
          Feriados que el motor salta al contar «primeros N días hábiles». Los fines de semana ya
          los descuenta solo. Sin municipio = feriado nacional.
        </p>

        <form action={addDiaNoHabil} className="mb-4 grid gap-2 sm:grid-cols-4">
          <input name="fecha" type="date" required className={inputClass} aria-label="Fecha del feriado" />
          <input
            name="motivo"
            required
            placeholder="Motivo…"
            className={`${inputClass} sm:col-span-2`}
          />
          <div className="flex gap-2">
            <select name="municipio" defaultValue="" className={`${inputClass} flex-1`} aria-label="Municipio">
              <option value="">Nacional</option>
              {municipios.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              +
            </button>
          </div>
        </form>

        {feriados.length === 0 ? (
          <p className="text-sm text-slate-400">Sin feriados cargados para el año.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {feriados.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
              >
                <span className="text-slate-700">
                  <span className="font-medium">{fechaCorta(f.fecha)}</span>
                  <span className="text-slate-500"> · {f.motivo}</span>
                  {f.municipio && (
                    <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                      {f.municipio}
                    </span>
                  )}
                </span>
                <form action={deleteDiaNoHabil}>
                  <input type="hidden" name="id" value={f.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline"
                    title={`Quitar ${claveDia(f.fecha)}`}
                  >
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
