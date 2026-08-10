"use client";

// Grid de asistencia (2.5): horas trabajadas por trabajador y día, con
// selección de columnas (días) para aplicar un valor a varios días de una
// vez. El formulario en sí es un <form action={guardarAsistencia}> normal —
// solo la barra de selección masiva necesita JS (escribe directo en los
// inputs por nombre, mismo espíritu que RuleForm: envuelve el markup
// existente en vez de convertir todo el grid en estado de React).

import { useState } from "react";
import { guardarAsistencia } from "@/app/(crm)/nomina/[companyId]/operacion/actions";

const inputClass =
  "w-16 rounded border border-slate-200 px-1.5 py-1 text-center text-xs outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30";

export type DiaColumna = { fecha: string; etiqueta: string; finDeSemana: boolean };
export type TrabajadorFila = { id: string; nombre: string; cedula: string };

function nombreCelda(trabajadorId: string, fecha: string) {
  return `h_${trabajadorId}_${fecha}`;
}

export default function AsistenciaGrid({
  companyId,
  periodo,
  dias,
  trabajadores,
  horasPorCelda,
}: {
  companyId: string;
  periodo: string;
  dias: DiaColumna[];
  trabajadores: TrabajadorFila[];
  horasPorCelda: Record<string, number>;
}) {
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [valorMasivo, setValorMasivo] = useState("8");

  const toggleColumna = (fecha: string) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(fecha)) next.delete(fecha);
      else next.add(fecha);
      return next;
    });
  };

  const aplicarMasivo = () => {
    if (seleccionadas.size === 0) return;
    const valor = valorMasivo.trim();
    for (const t of trabajadores) {
      for (const fecha of seleccionadas) {
        const input = document.querySelector<HTMLInputElement>(
          `input[name="${nombreCelda(t.id, fecha)}"]`
        );
        if (input) input.value = valor;
      }
    }
  };

  if (trabajadores.length === 0) {
    return <p className="text-sm text-slate-400">Sin empleados activos para marcar asistencia.</p>;
  }

  return (
    <form action={guardarAsistencia} className="space-y-3">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="periodo" value={periodo} />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
        <span className="text-slate-500">Aplicar a los días marcados:</span>
        <input
          type="number"
          min="0"
          step="0.5"
          value={valorMasivo}
          onChange={(e) => setValorMasivo(e.target.value)}
          className={inputClass}
        />
        <button
          type="button"
          onClick={aplicarMasivo}
          className="rounded-lg bg-slate-200 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-300"
        >
          Aplicar ({seleccionadas.size})
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="sticky left-0 z-10 min-w-[160px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left">
                Empleado
              </th>
              {dias.map((d) => (
                <th
                  key={d.fecha}
                  className={`min-w-[52px] border-b border-slate-200 px-1 py-2 text-center ${d.finDeSemana ? "bg-slate-100" : ""}`}
                >
                  <label className="flex flex-col items-center gap-0.5">
                    <input
                      type="checkbox"
                      checked={seleccionadas.has(d.fecha)}
                      onChange={() => toggleColumna(d.fecha)}
                      className="h-3 w-3"
                    />
                    <span>{d.etiqueta}</span>
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trabajadores.map((t) => (
              <tr key={t.id} className="border-b border-slate-100">
                <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-1.5">
                  <p className="font-medium text-slate-800">{t.nombre}</p>
                  <p className="text-[10px] text-slate-400">{t.cedula}</p>
                </td>
                {dias.map((d) => (
                  <td key={d.fecha} className={`px-1 py-1.5 text-center ${d.finDeSemana ? "bg-slate-50/60" : ""}`}>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      name={nombreCelda(t.id, d.fecha)}
                      defaultValue={horasPorCelda[`${t.id}_${d.fecha}`] ?? ""}
                      className={inputClass}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
      >
        Guardar borrador
      </button>
    </form>
  );
}
