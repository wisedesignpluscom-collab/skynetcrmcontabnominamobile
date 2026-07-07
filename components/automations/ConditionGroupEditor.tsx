"use client";

// Editor recursivo del árbol de condiciones (RuleGroup/RuleCondition).
// Edita GroupDef del evaluador directamente — el estado del Builder ES la
// estructura que se persiste, sin traducciones intermedias.

import type { ConditionDef, GroupDef, OperatorCode } from "@/lib/engine/evaluator";
import { OPERATORS } from "@/lib/engine/evaluator";
import type { DynamicOptions } from "./types";
import { FIELDS, type FieldSpec } from "@/lib/engine/builder";
import { ROLES, roleLabels } from "@/lib/permissions";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

// Pseudo-campo de contexto: el rol del usuario no vive en el registro
const ROLE_FIELD = "__role";

function opsForField(spec: FieldSpec | null): OperatorCode[] {
  if (!spec) return ["has_role"];
  switch (spec.kind) {
    case "number":
      return ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_empty", "not_empty"];
    case "date":
      return ["relative_date", "gt", "lt", "between", "is_empty", "not_empty"];
    case "select": {
      const ops: OperatorCode[] = ["eq", "neq", "is_empty", "not_empty"];
      return spec.dynamic === "user" ? ["is_current_user", ...ops] : ops;
    }
    default:
      return [
        "eq",
        "neq",
        "contains",
        "not_contains",
        "starts_with",
        "ends_with",
        "is_empty",
        "not_empty",
      ];
  }
}

function ValueInput({
  cond,
  spec,
  options,
  which,
  onChange,
}: {
  cond: ConditionDef;
  spec: FieldSpec | null;
  options: DynamicOptions;
  which: "value" | "value2";
  onChange: (v: string) => void;
}) {
  const value = (cond[which] ?? "") as string;

  if (cond.op === "has_role") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">— rol —</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {roleLabels[r]}
          </option>
        ))}
      </select>
    );
  }
  if (cond.op === "relative_date") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} w-24`}
        placeholder="± días"
        title="Negativo: en los últimos N días · Positivo: en los próximos N días · 0: hoy"
      />
    );
  }
  if (spec?.kind === "select" && (cond.op === "eq" || cond.op === "neq")) {
    const opts = spec.dynamic ? options[spec.dynamic] ?? [] : (spec.options ?? []).map((o) => ({ value: o, label: o }));
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">— valor —</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={spec?.kind === "number" ? "number" : spec?.kind === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} w-28 flex-1`}
      placeholder="valor"
    />
  );
}

function ConditionRow({
  cond,
  module,
  options,
  onChange,
  onRemove,
}: {
  cond: ConditionDef;
  module: string;
  options: DynamicOptions;
  onChange: (c: ConditionDef) => void;
  onRemove: () => void;
}) {
  const fields = FIELDS[module] ?? [];
  const isRole = cond.op === "has_role";
  const spec = isRole ? null : fields.find((f) => f.path === cond.field) ?? null;
  const ops = opsForField(spec);
  const opMeta = OPERATORS[cond.op];

  function changeField(path: string) {
    if (path === ROLE_FIELD) {
      onChange({ field: "", op: "has_role", value: "", value2: null });
      return;
    }
    const nextSpec = fields.find((f) => f.path === path) ?? null;
    const nextOps = opsForField(nextSpec);
    onChange({
      field: path,
      op: nextOps.includes(cond.op) && !isRole ? cond.op : nextOps[0],
      value: "",
      value2: null,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={isRole ? ROLE_FIELD : cond.field}
        onChange={(e) => changeField(e.target.value)}
        className={inputClass}
      >
        <option value="">— campo —</option>
        {fields.map((f) => (
          <option key={f.path} value={f.path}>
            {f.label}
          </option>
        ))}
        <option value={ROLE_FIELD}>Rol del usuario</option>
      </select>

      <select
        value={cond.op}
        onChange={(e) => {
          const op = e.target.value as OperatorCode;
          onChange({ ...cond, op, value: "", value2: null });
        }}
        className={inputClass}
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {OPERATORS[op].label}
          </option>
        ))}
      </select>

      {opMeta?.needsValue && (
        <ValueInput
          cond={cond}
          spec={spec}
          options={options}
          which="value"
          onChange={(value) => onChange({ ...cond, value })}
        />
      )}
      {opMeta?.needsValue2 && (
        <>
          <span className="text-xs text-slate-400">y</span>
          <ValueInput
            cond={cond}
            spec={spec}
            options={options}
            which="value2"
            onChange={(value2) => onChange({ ...cond, value2 })}
          />
        </>
      )}

      <button
        type="button"
        onClick={onRemove}
        title="Quitar condición"
        className="rounded px-1.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-50"
      >
        ✕
      </button>
    </div>
  );
}

export default function ConditionGroupEditor({
  group,
  module,
  options,
  onChange,
  onRemove,
  depth = 0,
}: {
  group: GroupDef;
  module: string;
  options: DynamicOptions;
  onChange: (g: GroupDef) => void;
  onRemove?: () => void; // la raíz no se puede quitar
  depth?: number;
}) {
  const update = (patch: Partial<GroupDef>) => onChange({ ...group, ...patch });

  return (
    <div
      className={`space-y-2 rounded-lg border p-3 ${
        depth === 0 ? "border-slate-200 bg-white" : "border-dashed border-slate-300 bg-slate-50/60"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
          <button
            type="button"
            onClick={() => update({ operator: "AND" })}
            className={`px-2.5 py-1 transition-colors ${
              group.operator === "AND" ? "bg-teal-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            Y (todas)
          </button>
          <button
            type="button"
            onClick={() => update({ operator: "OR" })}
            className={`px-2.5 py-1 transition-colors ${
              group.operator === "OR" ? "bg-teal-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            O (alguna)
          </button>
        </div>
        <p className="flex-1 text-[11px] text-slate-400">
          {group.operator === "AND"
            ? "Deben cumplirse todas las condiciones de este grupo."
            : "Basta con que se cumpla una condición de este grupo."}
        </p>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="Quitar grupo completo"
            className="rounded px-1.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-50"
          >
            ✕ grupo
          </button>
        )}
      </div>

      {group.conditions.map((cond, i) => (
        <ConditionRow
          key={i}
          cond={cond}
          module={module}
          options={options}
          onChange={(c) =>
            update({ conditions: group.conditions.map((old, j) => (j === i ? c : old)) })
          }
          onRemove={() => update({ conditions: group.conditions.filter((_, j) => j !== i) })}
        />
      ))}

      {group.groups.map((child, i) => (
        <ConditionGroupEditor
          key={i}
          group={child}
          module={module}
          options={options}
          depth={depth + 1}
          onChange={(g) => update({ groups: group.groups.map((old, j) => (j === i ? g : old)) })}
          onRemove={() => update({ groups: group.groups.filter((_, j) => j !== i) })}
        />
      ))}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() =>
            update({ conditions: [...group.conditions, { field: "", op: "eq", value: "" }] })
          }
          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
        >
          + Condición
        </button>
        {depth < 4 && (
          <button
            type="button"
            onClick={() =>
              update({ groups: [...group.groups, { operator: "OR", conditions: [], groups: [] }] })
            }
            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
          >
            + Grupo anidado
          </button>
        )}
      </div>
    </div>
  );
}
