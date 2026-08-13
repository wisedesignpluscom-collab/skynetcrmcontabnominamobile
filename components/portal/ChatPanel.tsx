"use client";

// Chat con el gestor desde el portal (Fase 2). Mismo esqueleto que
// components/clientes/ChatClientePanel.tsx, con el acento del portal (indigo)
// y sin companyId en el formulario: la acción lo toma de la sesión.

import { useEffect, useTransition } from "react";
import { enviarMensajePortal, marcarChatLeidoPortal } from "@/app/portal/(app)/chat/actions";
import ChatThread, { type ChatMessageView } from "@/components/chat/ChatThread";
import AutoRefresh from "@/components/AutoRefresh";

export type MensajePortalData = {
  id: string;
  contenido: string;
  createdAt: Date;
  autorTipo: string;
};

export default function ChatPanel({
  mensajes,
  gestorNombre,
}: {
  mensajes: MensajePortalData[];
  gestorNombre: string | null;
}) {
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      marcarChatLeidoPortal();
    });
  }, [mensajes.length]);

  const view: ChatMessageView[] = mensajes.map((m) => ({
    id: m.id,
    contenido: m.contenido,
    createdAt: m.createdAt,
    mine: m.autorTipo === "cliente",
  }));

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <AutoRefresh intervalMs={15000} />
      <h2 className="mb-1 font-semibold text-slate-900">
        Chat con {gestorNombre ? gestorNombre : "tu gestor"}
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        Escríbele directamente aquí — verá tu mensaje desde el sistema interno.
      </p>

      <div className="max-h-96 overflow-y-auto rounded-lg bg-slate-50/50 p-3">
        <ChatThread messages={view} miEtiqueta="Tú" otroEtiqueta={gestorNombre ?? "Tu gestor"} accentClass="bg-indigo-600" />
      </div>

      <form action={enviarMensajePortal} key={mensajes.length} className="mt-3 flex gap-2">
        <textarea
          name="contenido"
          required
          maxLength={4000}
          rows={2}
          placeholder="Escribe un mensaje…"
          className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
        <button
          type="submit"
          className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Enviar
        </button>
      </form>
    </section>
  );
}
