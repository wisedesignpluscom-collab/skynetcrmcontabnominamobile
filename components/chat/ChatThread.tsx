"use client";

// Presentación pura del hilo de mensajes — la usan tanto la ficha del cliente
// (components/clientes/ChatClientePanel.tsx) como el portal
// (components/portal/ChatPanel.tsx), cada uno decidiendo qué es "mío".

import { useState } from "react";

export type ChatMessageView = {
  id: string;
  contenido: string;
  createdAt: Date;
  mine: boolean;
  archivo?: { nombre: string; mime: string; tamano: number } | null;
};

const hora = new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit" });
const fechaCorta = new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short" });

function formatoTamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Adjunto({ id, archivo, mine }: { id: string; archivo: NonNullable<ChatMessageView["archivo"]>; mine: boolean }) {
  const url = `/api/chat/archivo/${id}`;
  if (archivo.mime.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
        {/* eslint-disable-next-line @next/next/no-img-element -- adjunto servido por ruta propia, no next/image */}
        <img src={url} alt={archivo.nombre} className="max-h-64 rounded-lg object-cover" />
      </a>
    );
  }
  return (
    <a
      href={url}
      download={archivo.nombre}
      className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        mine ? "bg-white/15 hover:bg-white/25" : "bg-white hover:bg-slate-50"
      }`}
    >
      <span className="text-lg">📄</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{archivo.nombre}</span>
        <span className={`block text-[10px] ${mine ? "text-white/70" : "text-slate-400"}`}>
          {formatoTamano(archivo.tamano)}
        </span>
      </span>
    </a>
  );
}

// Botón de adjuntar + nombre del archivo elegido. Estado propio a propósito:
// como vive dentro del <form key={mensajes.length}> de cada panel, se reinicia
// solo cuando el formulario se remonta tras un envío — sin useEffect.
export function AdjuntoInput({ titulo }: { titulo: string }) {
  const [nombre, setNombre] = useState<string | null>(null);
  return (
    <>
      {nombre && (
        <span className="max-w-[7rem] shrink truncate self-center text-xs text-slate-500" title={nombre}>
          📎 {nombre}
        </span>
      )}
      <label
        title={titulo}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition-colors hover:bg-slate-50"
      >
        📎
        <input
          type="file"
          name="archivo"
          className="hidden"
          onChange={(e) => setNombre(e.target.files?.[0]?.name ?? null)}
        />
      </label>
    </>
  );
}

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
            {m.contenido && <p className="whitespace-pre-wrap break-words">{m.contenido}</p>}
            {m.archivo && <Adjunto id={m.id} archivo={m.archivo} mine={m.mine} />}
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
