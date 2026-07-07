"use client";

// Editor de parámetros de una acción del workflow / regla de formulario.
// Los inputs salen de ParamSpec (lib/engine/builder.ts); el target de las
// Form Rules se llena con los campos del formulario del módulo (FIELDS.form).

import { FIELDS, type ActionSpec, type ParamSpec } from "@/lib/engine/builder";
import type { DraftAction } from "@/lib/engine/builder";
import type { DynamicOptions } from "./types";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

function optionsFor(
  param: ParamSpec,
  module: string,
  options: DynamicOptions
): { value: string; label: string }[] {
  // target de Form Rules: campos del formulario del módulo
  if (param.key === "target") {
    return (FIELDS[module] ?? [])
      .filter((f) => f.form)
      .map((f) => ({ value: f.path, label: f.label }));
  }
  if (param.dynamic) return options[param.dynamic] ?? [];
  return (param.options ?? []).map((o) => ({ value: o, label: o }));
}

export default function ActionEditor({
  action,
  spec,
  module,
  options,
  onChange,
}: {
  action: DraftAction;
  spec: ActionSpec;
  module: string;
  options: DynamicOptions;
  onChange: (a: DraftAction) => void;
}) {
  const set = (key: string, value: string) =>
    onChange({ ...action, params: { ...action.params, [key]: value } });

  const hasTemplates = spec.params.some((p) => p.template);

  return (
    <div className="space-y-2.5">
      {spec.hint && <p className="text-[11px] text-slate-400">{spec.hint}</p>}
      {spec.params.map((param) => {
        const value = action.params[param.key] ?? "";
        const isSelect = param.kind === "select" || param.key === "target";
        return (
          <label key={param.key} className="block text-xs text-slate-600">
            <span className="mb-1 block font-medium">
              {param.label}
              {param.required && <span className="text-red-400"> *</span>}
            </span>
            {isSelect ? (
              <select
                value={value}
                onChange={(e) => set(param.key, e.target.value)}
                className={`${inputClass} w-full`}
              >
                <option value="">— seleccionar —</option>
                {optionsFor(param, module, options).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : param.kind === "textarea" ? (
              <textarea
                value={value}
                onChange={(e) => set(param.key, e.target.value)}
                rows={3}
                className={`${inputClass} w-full`}
              />
            ) : (
              <input
                type={param.kind === "number" ? "number" : "text"}
                value={value}
                onChange={(e) => set(param.key, e.target.value)}
                className={`${inputClass} w-full`}
              />
            )}
            {param.hint && <span className="mt-0.5 block text-[11px] text-slate-400">{param.hint}</span>}
          </label>
        );
      })}
      {hasTemplates && (
        <p className="text-[11px] text-slate-400">
          💡 Puedes insertar datos del registro con llaves: {"{firstName}"}, {"{contact.email}"},{" "}
          {"{title}"}…
        </p>
      )}
    </div>
  );
}
