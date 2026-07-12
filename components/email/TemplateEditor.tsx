"use client";

// Editor de plantillas de correo: asunto + cuerpo HTML con barra de formato
// (negrita, cursiva, enlaces, listas, imagen/logo), inserción de variables
// mapeadas por módulo y vista previa con datos de ejemplo. Sin dependencias:
// usa un contenedor editable (contentEditable) y document.execCommand.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MODULES } from "@/lib/engine/builder";
import { templateVariables, sampleValueFor } from "@/lib/email/variables";
import { saveTemplate } from "@/app/(crm)/plantillas/actions";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export type TemplateDraft = {
  name: string;
  description: string;
  module: string;
  subject: string;
  bodyHtml: string;
};

// Reemplaza {ruta} por un valor de ejemplo para la vista previa
function renderPreview(html: string, module: string): string {
  const vars = templateVariables(module);
  let out = html;
  for (const v of vars) {
    out = out.split(v.token).join(sampleValueFor(v.label));
  }
  // variables no reconocidas quedan visibles entre llaves
  return out;
}

export default function TemplateEditor({
  templateId,
  initial,
}: {
  templateId: string | null;
  initial: TemplateDraft;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [module, setModule] = useState(initial.module);
  const [subject, setSubject] = useState(initial.subject);
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml);
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, startSaving] = useTransition();

  const vars = templateVariables(module);

  // Cargar el HTML inicial una sola vez (contentEditable no se controla por estado
  // para no perder el cursor al escribir)
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initial.bodyHtml || "";
  }, [initial.bodyHtml]);

  function syncBody() {
    if (editorRef.current) setBodyHtml(editorRef.current.innerHTML);
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncBody();
  }

  function insertLink() {
    const url = prompt("Enlace (URL):", "https://");
    if (url) exec("createLink", url);
  }

  function insertImage() {
    const url = prompt("URL de la imagen o logo (debe ser pública):", "https://");
    if (url) exec("insertImage", url);
  }

  // Inserta una variable en el campo que tenga el foco (asunto o cuerpo)
  function insertVariable(token: string) {
    if (document.activeElement === subjectRef.current && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + token + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
      return;
    }
    exec("insertText", token);
  }

  function save() {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("description", description);
    fd.set("module", module);
    fd.set("subject", subject);
    fd.set("bodyHtml", editorRef.current?.innerHTML ?? bodyHtml);
    startSaving(async () => {
      const result = await saveTemplate(templateId, fd);
      if (result.ok) router.push("/plantillas");
      else setErrors(result.errors);
    });
  }

  // No perder la selección al hacer clic en los botones de la barra
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-600">
            <span className="mb-1 block font-medium">Nombre de la plantilla</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Bienvenida a nuevo cliente"
              className={`${inputClass} w-full`}
            />
          </label>
          <label className="block text-xs text-slate-600">
            <span className="mb-1 block font-medium">Módulo (de dónde toma las variables)</span>
            <select
              value={module}
              onChange={(e) => setModule(e.target.value)}
              className={`${inputClass} w-full`}
            >
              {Object.entries(MODULES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 block text-xs text-slate-600">
          <span className="mb-1 block font-medium">Descripción (opcional)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Para qué sirve esta plantilla"
            className={`${inputClass} w-full`}
          />
        </label>
      </div>

      {/* Variables disponibles */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-2 text-xs font-medium text-slate-600">
          Variables (haz clic para insertarlas en el asunto o el cuerpo):
        </p>
        <div className="flex flex-wrap gap-1.5">
          {vars.map((v) => (
            <button
              key={v.token}
              type="button"
              onMouseDown={keepFocus}
              onClick={() => insertVariable(v.token)}
              title={`Inserta ${v.token}`}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-teal-400 hover:text-teal-700"
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Asunto */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block font-medium">Asunto</span>
          <input
            ref={subjectRef}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ej. Hola {firstName}, tu resumen del mes"
            className={`${inputClass} w-full`}
          />
        </label>

        {/* Cuerpo */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Cuerpo del correo</span>
            <button
              type="button"
              onClick={() => {
                syncBody();
                setPreview((p) => !p);
              }}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
            >
              {preview ? "✎ Editar" : "👁 Vista previa"}
            </button>
          </div>

          {preview ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-2 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">
                {renderPreview(subject, module) || "(sin asunto)"}
              </p>
              <div
                className="prose-email text-sm text-slate-700"
                dangerouslySetInnerHTML={{ __html: renderPreview(bodyHtml, module) }}
              />
            </div>
          ) : (
            <>
              {/* Barra de formato */}
              <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-b-0 border-slate-300 bg-slate-50 px-2 py-1.5">
                {[
                  { cmd: "bold", label: "B", cls: "font-bold" },
                  { cmd: "italic", label: "I", cls: "italic" },
                  { cmd: "underline", label: "U", cls: "underline" },
                ].map((b) => (
                  <button
                    key={b.cmd}
                    type="button"
                    onMouseDown={keepFocus}
                    onClick={() => exec(b.cmd)}
                    className={`h-7 w-7 rounded text-sm text-slate-600 hover:bg-slate-200 ${b.cls}`}
                  >
                    {b.label}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-slate-300" />
                <button type="button" onMouseDown={keepFocus} onClick={() => exec("formatBlock", "H2")} className="h-7 rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">Título</button>
                <button type="button" onMouseDown={keepFocus} onClick={() => exec("insertUnorderedList")} className="h-7 rounded px-2 text-xs text-slate-600 hover:bg-slate-200">• Lista</button>
                <button type="button" onMouseDown={keepFocus} onClick={insertLink} className="h-7 rounded px-2 text-xs text-slate-600 hover:bg-slate-200">🔗 Enlace</button>
                <button type="button" onMouseDown={keepFocus} onClick={insertImage} className="h-7 rounded px-2 text-xs text-slate-600 hover:bg-slate-200">🖼 Imagen</button>
                <button type="button" onMouseDown={keepFocus} onClick={() => exec("removeFormat")} className="h-7 rounded px-2 text-xs text-slate-500 hover:bg-slate-200">Limpiar</button>
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={syncBody}
                className="min-h-52 rounded-b-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-teal-500 [&_a]:text-teal-700 [&_a]:underline [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_img]:my-2 [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                💡 Escribe el correo y usa las variables de arriba. Para el logo, usa 🖼 Imagen con una URL pública.
              </p>
            </>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <ul className="list-inside list-disc space-y-0.5 text-xs text-red-600">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar plantilla"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/plantillas")}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
