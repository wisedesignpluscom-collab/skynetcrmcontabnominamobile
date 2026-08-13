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
  addFaseObligacion,
  updateFaseObligacion,
  deleteFaseObligacion,
  moveFaseObligacion,
} from "@/app/(crm)/configuracion/fiscal-actions";
import {
  PERIODICIDADES,
  REGLAS_VENCIMIENTO,
  ENTES,
  CALENDARIOS_SENIAT,
  claveDia,
  etiquetaPeriodo,
} from "@/lib/fiscal/vencimientos";
import { TIPOS_CAMPO, tipoCampoLabels, type CampoFase } from "@/lib/fases";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export type ObligacionRow = {
  id: string;
  nombre: string;
  jurisdiccion: string;
  periodicidad: string;
  enteReceptor: string;
  reglaTipo: string;
  reglaParam: number | null;
  calendarioTipo: string | null;
  municipio: string | null;
  notas: string | null;
  active: boolean;
  // Cómo queda su próxima fecha límite con los datos cargados hoy
  vistaPrevia: { periodo: string; fecha: Date | null; motivo?: string };
  fases: FaseRow[];
};

export type FaseRow = {
  id: string;
  order: number;
  nombre: string;
  descripcion: string | null;
  campos: CampoFase[];
};

function CampoFaseFields({ n, campo }: { n: 1 | 2 | 3; campo?: CampoFase }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-1">
      <input
        name={`campo${n}_label`}
        defaultValue={campo?.label ?? ""}
        placeholder={`Campo ${n}…`}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal-500"
      />
      <select
        name={`campo${n}_tipo`}
        defaultValue={campo?.tipo ?? "texto"}
        className="rounded-lg border border-slate-300 bg-white px-1 py-1.5 text-xs"
      >
        {TIPOS_CAMPO.map((t) => (
          <option key={t} value={t}>
            {tipoCampoLabels[t]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-500">
        <input type="checkbox" name={`campo${n}_requerido`} defaultChecked={campo?.requerido ?? false} />
        Oblig.
      </label>
    </div>
  );
}

export type FeriadoRow = { id: string; fecha: Date; motivo: string; municipio: string };

export type FilaCalendarioSeniat = {
  tipo: string;
  digito: number;
  mes: number;
  // 0 = no aplica (calendario no quincenal)
  quincena: number;
  diaDelMes: number;
};

const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });

// Una tabla de 10 dígitos × 12 meses para un calendario del SENIAT, dentro de
// SU PROPIO <form> — así guardar la 1ª quincena nunca toca los datos de la
// 2ª (cada form solo manda los campos de SU quincena; `saveCalendarioSeniat`
// solo borra/actualiza la quincena que venga en el propio formulario).
function TablaCalendario({
  anio,
  tipo,
  filas,
  quincena,
}: {
  anio: number;
  tipo: string;
  filas: FilaCalendarioSeniat[];
  quincena: number;
}) {
  const valor = (digito: number, mes: number) =>
    filas.find((f) => f.digito === digito && f.mes === mes && f.quincena === quincena)?.diaDelMes ?? null;
  const campo = (digito: number, mes: number) =>
    quincena ? `dia_${digito}_${mes}_${quincena}` : `dia_${digito}_${mes}`;

  return (
    <form action={saveCalendarioSeniat}>
      <input type="hidden" name="anio" value={anio} />
      <input type="hidden" name="tipo" value={tipo} />
      {quincena && <input type="hidden" name="quincena" value={quincena} />}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="p-1 text-left font-semibold text-slate-500">RIF …</th>
              {MESES.map((m) => (
                <th key={m} className="p-1 font-semibold text-slate-500">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }, (_, digito) => (
              <tr key={digito}>
                <td className="p-1 text-left font-medium text-slate-600">{digito}</td>
                {MESES.map((_, i) => {
                  const mes = i + 1;
                  return (
                    <td key={mes} className="p-0.5">
                      <input
                        name={campo(digito, mes)}
                        type="number"
                        min="1"
                        max="31"
                        defaultValue={valor(digito, mes) ?? ""}
                        placeholder="—"
                        className="w-12 rounded border border-slate-200 px-1 py-1 text-center outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="submit"
        className="mt-2 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
      >
        Guardar
      </button>
    </form>
  );
}

function CalendarioSection({
  anio,
  filasCalendario,
}: {
  anio: number;
  filasCalendario: FilaCalendarioSeniat[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Calendario del SENIAT {anio}</h2>
      <p className="mb-4 text-xs text-slate-400">
        La providencia trae un calendario distinto por cada tipo de obligación, y el día cambia
        cada mes — carga aquí el que necesites. Una obligación lo usa asignándoselo en «Regla de
        vencimiento → Según terminación del RIF» más arriba. Celda vacía = sin cargar ese mes.
      </p>

      <div className="space-y-3">
        {CALENDARIOS_SENIAT.map((cal) => {
          const filas = filasCalendario.filter((f) => f.tipo === cal.key);
          const totalCeldas = cal.periodicidad === "quincenal" ? 240 : 120;
          const cargadas = filas.length;
          return (
            <details key={cal.key} className="rounded-lg border border-slate-100">
              <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {cal.label}{" "}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  ({cargadas > 0 ? `${cargadas}/${totalCeldas} celdas cargadas` : "sin cargar"})
                </span>
              </summary>
              <div className="space-y-4 border-t border-slate-100 p-3">
                {cal.periodicidad === "quincenal" ? (
                  <>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-500">
                        1ª quincena (retenciones/operaciones del 01 al 15)
                      </p>
                      <TablaCalendario anio={anio} tipo={cal.key} filas={filas} quincena={1} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-500">
                        2ª quincena (16 al último día del mes)
                      </p>
                      <TablaCalendario anio={anio} tipo={cal.key} filas={filas} quincena={2} />
                    </div>
                  </>
                ) : (
                  <TablaCalendario anio={anio} tipo={cal.key} filas={filas} quincena={0} />
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

export default function FiscalSettings({
  obligaciones,
  municipios,
  filasCalendario,
  anioCalendario,
  feriados,
}: {
  obligaciones: ObligacionRow[];
  municipios: string[];
  filasCalendario: FilaCalendarioSeniat[];
  anioCalendario: number;
  feriados: FeriadoRow[];
}) {
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
          <select
            name="calendarioTipo"
            defaultValue=""
            className={`${inputClass} sm:col-span-3`}
            aria-label="Calendario del SENIAT (solo si la regla es «Según terminación del RIF»)"
          >
            <option value="">Calendario del SENIAT (si aplica)…</option>
            {CALENDARIOS_SENIAT.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
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
                <select
                  name="calendarioTipo"
                  defaultValue={o.calendarioTipo ?? ""}
                  className={`${inputClass} sm:col-span-3`}
                  aria-label="Calendario del SENIAT (solo si la regla es «Según terminación del RIF»)"
                >
                  <option value="">Calendario del SENIAT (si aplica)…</option>
                  {CALENDARIOS_SENIAT.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
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

              <details className="mt-2 border-t border-slate-100 pt-2">
                <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-slate-600">
                  Checklist de fases ({o.fases.length})
                </summary>
                <div className="mt-2 space-y-2">
                  <ol className="space-y-2">
                    {o.fases.map((f, i) => (
                      <li key={f.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                        <form action={updateFaseObligacion} className="space-y-1">
                          <input type="hidden" name="id" value={f.id} />
                          <div className="flex items-center gap-1">
                            <span className="w-5 text-center text-xs font-semibold text-slate-400">
                              {i + 1}
                            </span>
                            <input
                              name="nombre"
                              defaultValue={f.nombre}
                              className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal-500"
                            />
                            <div className="flex gap-0.5">
                              <button
                                type="submit"
                                formAction={moveFaseObligacion}
                                name="direccion"
                                value="arriba"
                                disabled={i === 0}
                                className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                                title="Subir"
                              >
                                ↑
                              </button>
                              <button
                                type="submit"
                                formAction={moveFaseObligacion}
                                name="direccion"
                                value="abajo"
                                disabled={i === o.fases.length - 1}
                                className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                                title="Bajar"
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                          <input
                            name="descripcion"
                            defaultValue={f.descripcion ?? ""}
                            placeholder="Ayuda para el analista…"
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal-500"
                          />
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">
                            Campos que certifican este paso (opcional, hasta 3)
                          </p>
                          <CampoFaseFields n={1} campo={f.campos[0]} />
                          <CampoFaseFields n={2} campo={f.campos[1]} />
                          <CampoFaseFields n={3} campo={f.campos[2]} />
                          <div className="flex justify-end gap-3 pt-1">
                            <button
                              type="submit"
                              formAction={deleteFaseObligacion}
                              className="text-[11px] font-medium text-slate-400 hover:text-red-600"
                            >
                              Eliminar
                            </button>
                            <button
                              type="submit"
                              className="rounded-lg bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-300"
                            >
                              Guardar
                            </button>
                          </div>
                        </form>
                      </li>
                    ))}
                  </ol>

                  <form
                    action={addFaseObligacion}
                    className="space-y-1 rounded-lg border border-dashed border-slate-200 p-2"
                  >
                    <input type="hidden" name="obligacionId" value={o.id} />
                    <input
                      name="nombre"
                      required
                      placeholder="Nueva fase…"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal-500"
                    />
                    <input
                      name="descripcion"
                      placeholder="Ayuda para el analista…"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal-500"
                    />
                    <CampoFaseFields n={1} />
                    <CampoFaseFields n={2} />
                    <CampoFaseFields n={3} />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-700"
                      >
                        + Agregar fase
                      </button>
                    </div>
                  </form>
                </div>
              </details>
            </li>
          ))}
          {obligaciones.length === 0 && (
            <li className="text-sm text-slate-400">Sin obligaciones en el catálogo.</li>
          )}
        </ul>
      </section>

      {/* ── Calendario del SENIAT ──────────────────────────────────────── */}
      <CalendarioSection anio={anioCalendario} filasCalendario={filasCalendario} />

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
