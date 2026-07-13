"use client";

// Botón "Enviar correo" en la ficha del contacto: abre un panel para elegir una
// plantilla (o escribir a mano) y enviar ahora o programar para una fecha/hora.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendEmailToContact } from "@/app/(crm)/contactos/email-actions";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export default function ContactEmailButton({
  contactId,
  templates,
  accounts,
  smtpConfigured,
}: {
  contactId: string;
  templates: { id: string; name: string }[];
  accounts: { value: string; label: string; isDefault: boolean }[];
  smtpConfigured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.isDefault)?.value ?? accounts[0]?.value ?? ""
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, start] = useTransition();

  const useTemplate = templateId !== "";

  function send() {
    setMsg(null);
    start(async () => {
      const r = await sendEmailToContact({
        contactId,
        templateId: useTemplate ? templateId : undefined,
        accountId: accountId || undefined,
        subject: useTemplate ? undefined : subject,
        body: useTemplate ? undefined : body,
        scheduledFor: schedule && when ? when : undefined,
      });
      if (r.ok) {
        setMsg({ ok: true, text: r.scheduled ? "Correo programado ✔" : "Correo puesto en cola de envío ✔" });
        setSubject("");
        setBody("");
        setTemplateId("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? "No se pudo enviar." });
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-teal-200 px-3 py-2.5 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-50"
      >
        ✉️ Enviar correo
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          {!smtpConfigured && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
              El SMTP aún no está configurado. El correo quedará en cola y se enviará cuando lo
              configures en Configuración.
            </p>
          )}

          {accounts.length > 1 && (
            <label className="mb-3 block text-xs text-slate-600">
              <span className="mb-1 block font-medium">Desde (cuenta remitente)</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`${inputClass} w-full`}>
                {accounts.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                    {a.isDefault ? " (predeterminada)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-xs text-slate-600">
            <span className="mb-1 block font-medium">Plantilla</span>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={`${inputClass} w-full`}>
              <option value="">— Escribir a mano —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          {!useTemplate && (
            <>
              <label className="mt-3 block text-xs text-slate-600">
                <span className="mb-1 block font-medium">Asunto</span>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`${inputClass} w-full`} placeholder="Hola {firstName}…" />
              </label>
              <label className="mt-3 block text-xs text-slate-600">
                <span className="mb-1 block font-medium">Mensaje</span>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={`${inputClass} w-full`} placeholder="Escribe el correo… puedes usar {firstName}, {company.name}" />
              </label>
            </>
          )}

          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="h-4 w-4" />
            Programar para más tarde
          </label>
          {schedule && (
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className={`${inputClass} mt-2 w-full`}
            />
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {sending ? "Enviando…" : schedule ? "Programar" : "Enviar"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">
              Cerrar
            </button>
          </div>

          {msg && (
            <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
          )}
        </div>
      )}
    </div>
  );
}
