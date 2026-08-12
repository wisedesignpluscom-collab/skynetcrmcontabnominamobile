"use client";

import { useActionState } from "react";
import { cambiarPasswordPortal } from "./actions";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-indigo-50/40 focus:ring-4 focus:ring-indigo-500/10";

export default function CambiarPasswordForm() {
  const [state, formAction, pending] = useActionState(cambiarPasswordPortal, undefined);

  return (
    <form action={formAction} className="max-w-md space-y-5">
      <div>
        <label htmlFor="actual" className="mb-2 block text-sm font-semibold text-slate-700">
          Contraseña actual
        </label>
        <input
          id="actual"
          name="actual"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="nueva" className="mb-2 block text-sm font-semibold text-slate-700">
          Nueva contraseña
        </label>
        <input
          id="nueva"
          name="nueva"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="confirmar" className="mb-2 block text-sm font-semibold text-slate-700">
          Confirmar nueva contraseña
        </label>
        <input
          id="confirmar"
          name="confirmar"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Contraseña actualizada.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
