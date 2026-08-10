import Link from "next/link";
import {
  actualizarTrabajador,
  deshabilitarTrabajador,
  reactivarTrabajador,
  agregarDocumentoTrabajador,
  eliminarDocumentoTrabajador,
} from "@/app/(crm)/empresas/trabajadores-actions";
import { TIPOS_CONTRATO, tipoContratoLabels } from "@/lib/trabajadores";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const fechaCorta = (d: Date) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
const fechaHora = (d: Date) =>
  d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

type TrabajadorFull = {
  id: string;
  cedula: string;
  nombre: string;
  cargo: string | null;
  tipoContrato: string | null;
  fechaIngreso: Date | null;
  fechaEgreso: Date | null;
  activo: boolean;
  motivoBaja: string | null;
  objetivoUsd: number | null;
  documentos: { id: string; nombre: string; url: string; createdAt: Date }[];
  actividades: { id: string; content: string; createdAt: Date }[];
};

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "contrato", label: "Contrato" },
  { key: "documentos", label: "Documentos" },
  { key: "ciclo", label: "Ciclo de vida" },
] as const;

export default function TrabajadorDetalle({
  companyId,
  trabajador: t,
  vista,
  listQuery,
}: {
  companyId: string;
  trabajador: TrabajadorFull;
  vista?: string;
  listQuery: Record<string, string>;
}) {
  const vistaActiva = vista === "editar" ? "editar" : TABS.some((tb) => tb.key === vista) ? vista! : "resumen";
  const base = `/nomina/${companyId}/empleados`;
  const href = (v: string) => `${base}?${new URLSearchParams({ ...listQuery, id: t.id, vista: v }).toString()}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{t.nombre}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                t.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {t.activo ? "Activo" : "Inactivo"}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {t.cedula}
            {t.cargo && ` · ${t.cargo}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={href("editar")}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Editar datos
          </Link>
          {t.activo ? (
            <form action={deshabilitarTrabajador} className="flex items-center gap-2">
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="id" value={t.id} />
              <input name="motivo" placeholder="Motivo (opcional)" className={`${inputClass} w-40`} />
              <button
                type="submit"
                className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                Deshabilitar
              </button>
            </form>
          ) : (
            <form action={reactivarTrabajador}>
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="id" value={t.id} />
              <button
                type="submit"
                className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                Reactivar
              </button>
            </form>
          )}
        </div>
      </div>

      <nav className="flex gap-1 border-b border-slate-100 px-5 pt-3">
        {TABS.map((tb) => (
          <Link
            key={tb.key}
            href={href(tb.key)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
              vistaActiva === tb.key
                ? "border-b-2 border-teal-600 text-teal-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tb.label}
          </Link>
        ))}
      </nav>

      <div className="p-5">
        {vistaActiva === "editar" && (
          <form action={actualizarTrabajador} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="id" value={t.id} />
            <label className="text-xs font-medium text-slate-500">
              Cédula
              <input name="cedula" defaultValue={t.cedula} required className={`${inputClass} mt-1 w-full`} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Nombre y apellido
              <input name="nombre" defaultValue={t.nombre} required className={`${inputClass} mt-1 w-full`} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Cargo
              <input name="cargo" defaultValue={t.cargo ?? ""} className={`${inputClass} mt-1 w-full`} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Tipo de contrato
              <select name="tipoContrato" defaultValue={t.tipoContrato ?? ""} className={`${inputClass} mt-1 w-full`}>
                <option value="">Sin definir</option>
                {TIPOS_CONTRATO.map((tc) => (
                  <option key={tc} value={tc}>
                    {tipoContratoLabels[tc]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Fecha de ingreso
              <input
                name="fechaIngreso"
                type="date"
                defaultValue={toDateInput(t.fechaIngreso)}
                className={`${inputClass} mt-1 w-full`}
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Fecha de egreso
              <input
                name="fechaEgreso"
                type="date"
                defaultValue={toDateInput(t.fechaEgreso)}
                className={`${inputClass} mt-1 w-full`}
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Objetivo USD (Compensación USD, opcional)
              <input
                name="objetivoUsd"
                type="number"
                min="0"
                step="0.01"
                defaultValue={t.objetivoUsd ?? ""}
                placeholder="Usa el objetivo general de la empresa"
                className={`${inputClass} mt-1 w-full`}
              />
            </label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Guardar cambios
              </button>
              <Link href={href("resumen")} className="text-sm text-slate-500 hover:underline">
                Cancelar
              </Link>
            </div>
          </form>
        )}

        {vistaActiva === "resumen" && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-400">Cédula</dt>
              <dd className="text-sm text-slate-800">{t.cedula}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">Cargo</dt>
              <dd className="text-sm text-slate-800">{t.cargo ?? "Sin definir"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">Fecha de ingreso</dt>
              <dd className="text-sm text-slate-800">{t.fechaIngreso ? fechaCorta(t.fechaIngreso) : "Sin registrar"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">Estado</dt>
              <dd className="text-sm text-slate-800">
                {t.activo ? "Activo" : `Inactivo desde ${t.fechaEgreso ? fechaCorta(t.fechaEgreso) : "—"}`}
              </dd>
            </div>
            {!t.activo && t.motivoBaja && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-400">Motivo de la baja</dt>
                <dd className="text-sm text-slate-800">{t.motivoBaja}</dd>
              </div>
            )}
          </dl>
        )}

        {vistaActiva === "contrato" && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-400">Tipo de contrato</dt>
              <dd className="text-sm text-slate-800">
                {t.tipoContrato ? tipoContratoLabels[t.tipoContrato] ?? t.tipoContrato : "Sin definir"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">Fecha de ingreso</dt>
              <dd className="text-sm text-slate-800">{t.fechaIngreso ? fechaCorta(t.fechaIngreso) : "Sin registrar"}</dd>
            </div>
            {t.fechaEgreso && (
              <div>
                <dt className="text-xs font-medium text-slate-400">Fecha de egreso</dt>
                <dd className="text-sm text-slate-800">{fechaCorta(t.fechaEgreso)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-slate-400">Objetivo USD (Compensación USD)</dt>
              <dd className="text-sm text-slate-800">
                {t.objetivoUsd != null ? `$${t.objetivoUsd.toFixed(2)}` : "Usa el objetivo general de la empresa"}
              </dd>
            </div>
            <p className="text-xs text-slate-400 sm:col-span-2">
              Jornada y beneficios se definen en Configuración de nómina.
            </p>
          </dl>
        )}

        {vistaActiva === "documentos" && (
          <div className="space-y-4">
            <form action={agregarDocumentoTrabajador} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="trabajadorId" value={t.id} />
              <label className="text-xs text-slate-500">
                Nombre
                <input name="nombre" required placeholder="Ej.: Cédula escaneada" className={`${inputClass} mt-1 block w-48`} />
              </label>
              <label className="flex-1 text-xs text-slate-500">
                URL
                <input name="url" required type="url" placeholder="https://…" className={`${inputClass} mt-1 block w-full`} />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Adjuntar
              </button>
            </form>

            {t.documentos.length === 0 ? (
              <p className="text-sm text-slate-400">Sin documentos adjuntos.</p>
            ) : (
              <ul className="space-y-1.5">
                {t.documentos.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                    <a href={doc.url} target="_blank" rel="noreferrer" className="truncate text-sm text-teal-700 hover:underline">
                      {doc.nombre}
                    </a>
                    <form action={eliminarDocumentoTrabajador}>
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="id" value={doc.id} />
                      <button type="submit" className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline">
                        Eliminar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {vistaActiva === "ciclo" && (
          <ul className="space-y-3">
            {t.actividades.length === 0 && <p className="text-sm text-slate-400">Sin eventos registrados.</p>}
            {t.actividades.map((a) => (
              <li key={a.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-sm text-slate-800">{a.content}</p>
                <p className="text-xs text-slate-400">{fechaHora(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
