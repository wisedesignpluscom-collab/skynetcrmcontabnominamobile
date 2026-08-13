"use client";

// Chat con el cliente desde la ficha (Fase 2). Marca leído al montar (el
// gestor ya está viendo la conversación) y se refresca cada 15s
// (AutoRefresh) para sentir "en vivo" sin websockets.

import { useEffect, useTransition } from "react";
import { enviarMensajeStaff, marcarChatLeidoStaff } from "@/app/(crm)/empresas/chat-actions";
import ChatThread, { type ChatMessageView } from "@/components/chat/ChatThread";
import AutoRefresh from "@/components/AutoRefresh";

export type MensajeStaffData = {
  id: string;
  contenido: string;
  createdAt: Date;
  autorTipo: string;
};

export default function ChatClientePanel({
  companyId,
  mensajes,
}: {
  companyId: string;
  mensajes: MensajeStaffData[];
}) {
  const [, startTransition] = useTransition();

  useEffect(() => {
    const fd = new FormData();
    fd.set("companyId", companyId);
    startTransition(() => {
      marcarChatLeidoStaff(fd);
    });
    // Se re-marca cada vez que cambia la cantidad de mensajes (llegó uno nuevo)
  }, [companyId, mensajes.length]);

  const view: ChatMessageView[] = mensajes.map((m) => ({
    id: m.id,
    contenido: m.contenido,
    createdAt: m.createdAt,
    mine: m.autorTipo === "staff",
  }));

  return (
    <section id="chat" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <AutoRefresh intervalMs={15000} />
      <h2 className="mb-1 font-semibold text-slate-900">Chat con el cliente</h2>
      <p className="mb-4 text-xs text-slate-400">
        Esta conversación también la ve el cliente desde su portal.
      </p>

      <div className="max-h-96 overflow-y-auto rounded-lg bg-slate-50/50 p-3">
        <ChatThread messages={view} miEtiqueta="Tú" otroEtiqueta="Cliente" accentClass="bg-teal-600" />
      </div>

      <form action={enviarMensajeStaff} key={mensajes.length} className="mt-3 flex gap-2">
        <input type="hidden" name="companyId" value={companyId} />
        <textarea
          name="contenido"
          required
          maxLength={4000}
          rows={2}
          placeholder="Escribe un mensaje…"
          className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        />
        <button
          type="submit"
          className="self-end rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
        >
          Enviar
        </button>
      </form>
    </section>
  );
}
