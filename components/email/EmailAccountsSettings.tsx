"use client";

// Panel de cuentas de correo saliente (SMTP). Permite configurar VARIAS cuentas
// remitentes, marcar una como predeterminada, probar el envío y editarlas.
// La contraseña es write-only: al editar llega vacía y solo se reemplaza si
// escribes una nueva.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveEmailAccount,
  removeEmailAccount,
  makeDefaultEmailAccount,
  testEmailAccount,
  type AccountFormInput,
} from "@/app/(crm)/configuracion/email-accounts-actions";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export type AccountView = {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  isDefault: boolean;
};

type FormState = {
  id?: string;
  label: string;
  host: string;
  port: string;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
};

const emptyForm: FormState = {
  label: "",
  host: "",
  port: "587",
  secure: false,
  user: "",
  pass: "",
  fromName: "",
  fromEmail: "",
};

export default function EmailAccountsSettings({ accounts }: { accounts: AccountView[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null); // null = formulario cerrado
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [busy, startBusy] = useTransition();

  // Prueba de envío por cuenta
  const [testId, setTestId] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, startTesting] = useTransition();

  const editing = !!form?.id;

  function openNew() {
    setMsg(null);
    setForm({ ...emptyForm });
  }
  function openEdit(a: AccountView) {
    setMsg(null);
    setForm({
      id: a.id,
      label: a.label,
      host: a.host,
      port: String(a.port),
      secure: a.secure,
      user: a.user,
      pass: "",
      fromName: a.fromName,
      fromEmail: a.fromEmail,
    });
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  function presetGmail() {
    setForm((f) => (f ? { ...f, host: "smtp.gmail.com", port: "587", secure: false } : f));
  }

  function save() {
    if (!form) return;
    setMsg(null);
    startSaving(async () => {
      const payload: AccountFormInput = { ...form };
      const r = await saveEmailAccount(payload);
      if (r.ok) {
        setForm(null);
        setMsg({ ok: true, text: editing ? "Cuenta actualizada." : "Cuenta agregada." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? "No se pudo guardar." });
      }
    });
  }

  function makeDefault(id: string) {
    setMsg(null);
    startBusy(async () => {
      const r = await makeDefaultEmailAccount(id);
      if (r.ok) router.refresh();
      else setMsg({ ok: false, text: r.error ?? "No se pudo." });
    });
  }

  function remove(a: AccountView) {
    if (!confirm(`¿Eliminar la cuenta «${a.label}»?`)) return;
    setMsg(null);
    startBusy(async () => {
      const r = await removeEmailAccount(a.id);
      if (r.ok) {
        setMsg({ ok: true, text: "Cuenta eliminada." });
        router.refresh();
      } else setMsg({ ok: false, text: r.error ?? "No se pudo eliminar." });
    });
  }

  function runTest(id: string) {
    setMsg(null);
    startTesting(async () => {
      const r = await testEmailAccount(id, testTo);
      setMsg(
        r.ok
          ? { ok: true, text: `Correo de prueba enviado a ${testTo}. Revisa la bandeja.` }
          : { ok: false, text: r.error ?? "No se pudo enviar." }
      );
      if (r.ok) {
        setTestId(null);
        setTestTo("");
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Correo saliente — cuentas</h2>
        {form === null && (
          <button
            type="button"
            onClick={openNew}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
          >
            + Agregar cuenta
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Configura varias cuentas y marca una como predeterminada. Al enviar un correo (manual o
        desde una automatización) podrás elegir desde cuál sale. Con Gmail: usa una “contraseña de
        aplicación” (requiere verificación en 2 pasos).
      </p>

      {/* Lista de cuentas */}
      {accounts.length === 0 && form === null && (
        <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
          Aún no hay cuentas de correo. Agrega la primera para poder enviar correos.
        </p>
      )}

      <ul className="space-y-2">
        {accounts.map((a) => (
          <li key={a.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-slate-800">
                  <span className="truncate">{a.label}</span>
                  {a.isDefault && (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      Predeterminada
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {a.fromEmail || a.user} · {a.host}:{a.port}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {!a.isDefault && (
                  <button
                    type="button"
                    onClick={() => makeDefault(a.id)}
                    disabled={busy}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    Predeterminar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTestId(testId === a.id ? null : a.id);
                    setTestTo("");
                    setMsg(null);
                  }}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Probar
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  disabled={busy}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </div>

            {testId === a.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                <input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="correo@destino.com"
                  className={`${inputClass} min-w-52 flex-1`}
                />
                <button
                  type="button"
                  onClick={() => runTest(a.id)}
                  disabled={testing || !testTo}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                >
                  {testing ? "Enviando…" : "Enviar prueba"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Formulario agregar/editar */}
      {form !== null && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              {editing ? "Editar cuenta" : "Nueva cuenta"}
            </h3>
            <button
              type="button"
              onClick={presetGmail}
              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
            >
              Usar valores de Gmail
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-600 sm:col-span-2">
              <span className="mb-1 block font-medium">Etiqueta (nombre de la cuenta)</span>
              <input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Ventas" className={`${inputClass} w-full`} />
            </label>
            <label className="block text-xs text-slate-600">
              <span className="mb-1 block font-medium">Servidor (host)</span>
              <input value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.gmail.com" className={`${inputClass} w-full`} />
            </label>
            <div className="flex gap-3">
              <label className="block flex-1 text-xs text-slate-600">
                <span className="mb-1 block font-medium">Puerto</span>
                <input value={form.port} onChange={(e) => set("port", e.target.value)} placeholder="587" className={`${inputClass} w-full`} />
              </label>
              <label className="flex items-end gap-1.5 pb-2 text-xs text-slate-600">
                <input type="checkbox" checked={form.secure} onChange={(e) => set("secure", e.target.checked)} className="h-4 w-4" />
                SSL (465)
              </label>
            </div>
            <label className="block text-xs text-slate-600">
              <span className="mb-1 block font-medium">Usuario</span>
              <input value={form.user} onChange={(e) => set("user", e.target.value)} placeholder="tucorreo@gmail.com" className={`${inputClass} w-full`} />
            </label>
            <label className="block text-xs text-slate-600">
              <span className="mb-1 block font-medium">
                Contraseña {editing && <span className="text-emerald-600">(dejar vacío para conservarla)</span>}
              </span>
              <input
                type="password"
                value={form.pass}
                onChange={(e) => set("pass", e.target.value)}
                placeholder={editing ? "•••••• (sin cambios)" : "contraseña de aplicación"}
                className={`${inputClass} w-full`}
              />
            </label>
            <label className="block text-xs text-slate-600">
              <span className="mb-1 block font-medium">Nombre del remitente</span>
              <input value={form.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="Despacho Contable XYZ" className={`${inputClass} w-full`} />
            </label>
            <label className="block text-xs text-slate-600">
              <span className="mb-1 block font-medium">Correo del remitente</span>
              <input value={form.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} placeholder="(por defecto, el usuario)" className={`${inputClass} w-full`} />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Agregar cuenta"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setMsg(null);
              }}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

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
