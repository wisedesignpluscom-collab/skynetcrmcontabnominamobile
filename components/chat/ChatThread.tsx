// Presentación pura del hilo de mensajes — la usan tanto la ficha del cliente
// (components/clientes/ChatClientePanel.tsx) como el portal
// (components/portal/ChatPanel.tsx), cada uno decidiendo qué es "mío".

export type ChatMessageView = {
  id: string;
  contenido: string;
  createdAt: Date;
  mine: boolean;
};

const hora = new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit" });
const fechaCorta = new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short" });

export default function ChatThread({
  messages,
  miEtiqueta,
  otroEtiqueta,
  accentClass = "bg-teal-600",
}: {
  messages: ChatMessageView[];
  miEtiqueta: string;
  otroEtiqueta: string;
  accentClass?: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
        Todavía no hay mensajes. Escribe el primero.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
              m.mine ? `${accentClass} text-white` : "bg-slate-100 text-slate-800"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
            <p className={`mt-1 text-[10px] ${m.mine ? "text-white/70" : "text-slate-400"}`}>
              {m.mine ? miEtiqueta : otroEtiqueta} · {fechaCorta.format(m.createdAt)}{" "}
              {hora.format(m.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
