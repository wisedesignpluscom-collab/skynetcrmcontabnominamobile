"use client";

// Panel de configuración del correo saliente (SMTP). La contraseña es write-only:
// si ya hay una guardada, el campo llega vacío y solo se reemplaza si escribes una
// nueva. Incluye botón para enviar un correo de prueba.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSmtp, testSmtp } from "@/app/(crm)/configuracion/smtp-actions";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export type SmtpInitial = {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  hasPassword: boolean;
};

export default function SmtpSettings({ initial }: { initial: SmtpInitial }) {
  const router = useRouter();
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(initial.port);
  const [secure, setSecure] = useState(initial.secure);
  const [user, setUser] = useState(initial.user);
  const [pass, setPass] = useState("");
  const [fromName, setFromName] = useState(initial.fromName);
  const [fromEmail, setFromEmail] = useState(initial.fromEmail);
  const [testTo, setTestTo] = useState("");

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();

  function save() {
    setMsg(null);
    startSaving(async () => {
      const r = await saveSmtp({ host, port, secure, user, pass, fromName, fromEmail });
      if (r.ok) {
        setPass("");
        setMsg({ ok: true, text: "Configuración guardada." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? "No se pudo guardar." });
      }
    });
  }

  function test() {
    setMsg(null);
    startTesting(async () => {
      const r = await testSmtp(testTo);
      setMsg(
        r.ok
          ? { ok: true, text: `Correo de prueba enviado a ${testTo}. Revisa la bandeja.` }
          : { ok: false, text: r.error ?? "No se pudo enviar." }
      );
    });
  }

  // Ajustes rápidos para Gmail
  function presetGmail() {
    setHost("smtp.gmail.com");
    setPort("587");
    setSecure(false);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Correo saliente (SMTP)</h2>
        <button
          type="button"
          onClick={presetGmail}
          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
        >
          Usar valores de Gmail
        </button>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Datos del servidor que enviará los correos automáticos y programados. Con Gmail: usa una
        “contraseña de aplicación” (requiere verificación en 2 pasos).
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block font-medium">Servidor (host)</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" className={`${inputClass} w-full`} />
        </label>
        <div className="flex gap-3">
          <label className="block flex-1 text-xs text-slate-600">
            <span className="mb-1 block font-medium">Puerto</span>
            <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" className={`${inputClass} w-full`} />
          </label>
          <label className="flex items-end gap-1.5 pb-2 text-xs text-slate-600">
            <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="h-4 w-4" />
            SSL (465)
          </label>
        </div>
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block font-medium">Usuario</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="tucorreo@gmail.com" className={`${inputClass} w-full`} />
        </label>
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block font-medium">
            Contraseña {initial.hasPassword && <span className="text-emerald-600">(ya guardada)</span>}
          </span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder={initial.hasPassword ? "•••••• (dejar vacío para conservarla)" : "contraseña de aplicación"}
            className={`${inputClass} w-full`}
          />
        </label>
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block font-medium">Nombre del remitente</span>
          <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Despacho Contable XYZ" className={`${inputClass} w-full`} />
        </label>
        <label className="block text-xs text-slate-600">
          <span className="mb-1 block font-medium">Correo del remitente</span>
          <input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="(por defecto, el usuario)" className={`${inputClass} w-full`} />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>

      {/* Prueba de envío */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-medium text-slate-600">Enviar un correo de prueba</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="correo@destino.com"
            className={`${inputClass} min-w-52 flex-1`}
          />
          <button
            type="button"
            onClick={test}
            disabled={testing || !testTo}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            {testing ? "Enviando…" : "Enviar prueba"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">Guarda la configuración antes de probar.</p>
      </div>

      {msg && (
        <p
          className={`mt-3 rounded-lg border p-2 text-xs ${
            msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
