import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete } from "@/lib/permissions";
import { crearGeocerca, actualizarGeocerca, eliminarGeocerca } from "./actions";

export const dynamic = "force-dynamic";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default async function UbicacionesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) notFound();

  const [geocercas, jornadas, session] = await Promise.all([
    prisma.geocerca.findMany({ where: { companyId }, include: { jornada: true }, orderBy: { nombre: "asc" } }),
    prisma.jornada.findMany({ where: { companyId }, orderBy: { nombre: "asc" } }),
    getSession(),
  ]);
  const puedeEliminar = canDelete(session?.role);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <Link href={`/nomina/${companyId}`} className="text-xs font-medium text-slate-400 hover:text-teal-700 hover:underline">
          ← Volver a Nómina
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Ubicaciones</h1>
        <p className="text-sm text-slate-500">Geocercas para marcaje de asistencia por proximidad.</p>
        <p className="mt-2 text-xs text-slate-400">
          Concepto genérico: zona geográfica (centro + radio) opcionalmente vinculada a una jornada — sin captura de
          referencia todavía, se ajusta cuando se defina con el cliente.
        </p>
      </div>

      <details className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700 hover:text-teal-700">
          + Nueva geocerca
        </summary>
        <form action={crearGeocerca} className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-3">
          <input type="hidden" name="companyId" value={companyId} />
          <label className="text-xs font-medium text-slate-500">
            Nombre
            <input name="nombre" required placeholder="Ej.: Oficina principal" className={`${inputClass} mt-1 w-full`} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Latitud
            <input name="latitud" type="number" step="any" required className={`${inputClass} mt-1 w-full`} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Longitud
            <input name="longitud" type="number" step="any" required className={`${inputClass} mt-1 w-full`} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Radio (metros)
            <input name="radioMetros" type="number" min="1" defaultValue={100} className={`${inputClass} mt-1 w-full`} />
          </label>
          <label className="text-xs font-medium text-slate-500 sm:col-span-2">
            Jornada vinculada (opcional)
            <select name="jornadaId" defaultValue="" className={`${inputClass} mt-1 w-full`}>
              <option value="">Sin vincular</option>
              {jornadas.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nombre}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 sm:col-span-3 sm:w-fit"
          >
            Crear geocerca
          </button>
        </form>
      </details>

      {geocercas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
          Sin geocercas registradas todavía.
        </p>
      ) : (
        <ul className="space-y-2">
          {geocercas.map((g) => (
            <li key={g.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-medium ${g.activa ? "text-slate-800" : "text-slate-400 line-through"}`}>{g.nombre}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {g.latitud.toFixed(5)}, {g.longitud.toFixed(5)} · {g.radioMetros}m
                  </span>
                  {g.jornada && (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{g.jornada.nombre}</span>
                  )}
                  {!g.activa && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Inactiva</span>}
                </span>
                {puedeEliminar && (
                  <form action={eliminarGeocerca}>
                    <input type="hidden" name="companyId" value={companyId} />
                    <input type="hidden" name="id" value={g.id} />
                    <button type="submit" className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline">
                      Eliminar
                    </button>
                  </form>
                )}
              </div>

              <details>
                <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-teal-700">
                  Editar
                </summary>
                <form action={actualizarGeocerca} className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="id" value={g.id} />
                  <input name="nombre" defaultValue={g.nombre} required className={inputClass} />
                  <input name="latitud" type="number" step="any" defaultValue={g.latitud} required className={inputClass} />
                  <input name="longitud" type="number" step="any" defaultValue={g.longitud} required className={inputClass} />
                  <input name="radioMetros" type="number" min="1" defaultValue={g.radioMetros} className={inputClass} />
                  <select name="jornadaId" defaultValue={g.jornadaId ?? ""} className={inputClass}>
                    <option value="">Sin vincular</option>
                    {jornadas.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.nombre}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" name="activa" defaultChecked={g.activa} className="h-4 w-4" />
                    Activa
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 sm:col-span-3 sm:w-fit"
                  >
                    Guardar
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
