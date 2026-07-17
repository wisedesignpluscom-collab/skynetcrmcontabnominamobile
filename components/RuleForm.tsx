"use client";

// ══ Automation Engine — Runtime de Form Rules en el cliente (Fase 2) ═══════
// Envuelve un formulario existente SIN re-renderizarlo: escucha cada cambio,
// evalúa las reglas con el mismo evaluador puro del servidor y aplica los
// efectos directamente sobre los campos (mostrar/ocultar, requerir, bloquear,
// valores, placeholder, tooltip, resaltado y mensajes).
// La validación definitiva sigue siendo server-side; esto es feedback inmediato.

import { useEffect, useRef } from "react";
import type { RuleDef, RuleContext } from "@/lib/engine/evaluator";
import { applyFormRules } from "@/lib/engine/formRules";

const HIGHLIGHT_CLASSES = ["ring-2", "ring-amber-400", "border-amber-400"];

export default function RuleForm({
  rules,
  user,
  pipeline,
  children,
}: {
  rules: RuleDef[];
  user?: { id: string; role: string } | null;
  pipeline?: RuleContext["pipeline"];
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const form = root?.querySelector("form");
    const messageBox = root?.querySelector<HTMLElement>("[data-rule-messages]");
    if (!root || !form || rules.length === 0) return;

    // Estado base de cada campo (para revertir los efectos cuando una regla deja
    // de cumplirse; si no, quedarían "pegados": required, resaltado, etc.).
    type Base = { required: boolean; disabled: boolean; placeholder: string; title: string; display: string };
    const baseline = new Map<string, Base>();
    for (const wrap of Array.from(form.querySelectorAll<HTMLElement>("[data-field]"))) {
      const input = wrap.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input, select, textarea"
      );
      const name = input?.getAttribute("name") ?? wrap.getAttribute("data-field") ?? "";
      if (!name || baseline.has(name)) continue;
      baseline.set(name, {
        required: !!input?.required,
        disabled: !!input?.disabled,
        placeholder: (input && "placeholder" in input ? input.placeholder : "") ?? "",
        title: input?.title ?? "",
        display: wrap.style.display,
      });
    }

    const resetToBaseline = () => {
      for (const [name, b] of baseline) {
        const input = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          `[name="${CSS.escape(name)}"]`
        );
        const wrapper = form.querySelector<HTMLElement>(`[data-field="${CSS.escape(name)}"]`);
        if (wrapper) wrapper.style.display = b.display;
        if (!input) continue;
        input.required = b.required;
        input.disabled = b.disabled;
        if ("placeholder" in input) input.placeholder = b.placeholder;
        input.title = b.title;
        for (const cls of HIGHLIGHT_CLASSES) input.classList.remove(cls);
      }
    };

    const apply = () => {
      resetToBaseline();
      // Registro actual a partir del formulario
      const record: Record<string, unknown> = {};
      new FormData(form).forEach((value, key) => {
        if (!key.startsWith("$ACTION") && typeof value === "string") record[key] = value;
      });

      const effects = applyFormRules(rules, { record, user, pipeline });

      for (const [name, eff] of Object.entries(effects.fields)) {
        const input = form.querySelector<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >(`[name="${CSS.escape(name)}"]`);
        // La "sección" de un campo es su envoltorio data-field (o el del propio nombre)
        const wrapper =
          form.querySelector<HTMLElement>(`[data-field="${CSS.escape(name)}"]`) ??
          input?.closest<HTMLElement>("[data-field]") ??
          input?.parentElement ??
          null;

        if (wrapper && eff.visible !== undefined) {
          wrapper.style.display = eff.visible ? "" : "none";
        }
        if (!input) continue;

        if (eff.required !== undefined) input.required = eff.required;
        if (eff.disabled !== undefined) input.disabled = eff.disabled;
        if (eff.placeholder !== undefined && "placeholder" in input) {
          input.placeholder = eff.placeholder;
        }
        if (eff.tooltip !== undefined) input.title = eff.tooltip;

        // Nunca pelear contra el usuario: no tocar el campo que está editando
        const editing = document.activeElement === input;
        if (eff.clearValue && !editing && input.value !== "") input.value = "";
        if (eff.value !== undefined && !editing && input.value !== eff.value) {
          input.value = eff.value;
        }

        for (const cls of HIGHLIGHT_CLASSES) {
          input.classList.toggle(cls, !!eff.highlight);
        }
      }

      // Mensajes (construidos con textContent — nunca HTML crudo)
      if (messageBox) {
        messageBox.replaceChildren(
          ...effects.messages.map((m) => {
            const p = document.createElement("p");
            p.textContent = m.text;
            p.className =
              m.tone === "error"
                ? "rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                : m.tone === "warning"
                ? "rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700"
                : "rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700";
            return p;
          })
        );
      }
    };

    apply(); // estado inicial
    form.addEventListener("input", apply);
    form.addEventListener("change", apply);
    return () => {
      form.removeEventListener("input", apply);
      form.removeEventListener("change", apply);
    };
  }, [rules, user, pipeline]);

  return (
    <div ref={rootRef}>
      <div data-rule-messages className="mb-4 space-y-2 empty:hidden" />
      {children}
    </div>
  );
}
