"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Alerts = {
  avisos?: { id: string; titulo: string; cuerpo: string | null; url: string | null }[];
  aprobaciones?: { id: string; titulo: string; tipo: string; solicitante: string }[];
  tareas: { id: string; titulo: string; contacto: string | null }[];
  posventa: { id: string; cliente: string; negocio: string }[];
  estancadas: { id: string; titulo: string; dias: number }[];
  mensajesCliente?: { id: string; companyId: string; cliente: string; extracto: string }[];
};

// Beep corto de dos notas — sin depender de un archivo de audio.
function reproducirSonidoAviso() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const tono = (freq: number, inicio: number, duracion: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracion);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + duracion);
    };
    tono(740, 0, 0.12);
    tono(988, 0.11, 0.16);
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {}
}

type MensajeCliente = { id: string; companyId: string; cliente: string; extracto: string };

export default function NotificationsBell() {
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<MensajeCliente[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const vistosRef = useRef<Set<string> | null>(null);

  // Cargar alertas al entrar, al navegar y cada 60 segundos
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/alertas")
        .then((r) => r.json())
        .then((data: Alerts) => {
          if (!active) return;
          setAlerts(data);

          // Mensajes de cliente nunca vistos en esta pestaña → toast + sonido.
          // La primera carga solo "memoriza" los existentes (no dispara avisos
          // retroactivos de mensajes que ya estaban ahí antes de abrir el sistema).
          const idsActuales = data.mensajesCliente ?? [];
          if (vistosRef.current === null) {
            vistosRef.current = new Set(idsActuales.map((m) => m.id));
          } else {
            const nuevos = idsActuales.filter((m) => !vistosRef.current!.has(m.id));
            if (nuevos.length > 0) {
              nuevos.forEach((m) => vistosRef.current!.add(m.id));
              setToasts((prev) => [...nuevos, ...prev].slice(0, 4));
              reproducirSonidoAviso();
            }
          }
        })
        .catch(() => {});
    load();
    const interval = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pathname]);

  const cerrarToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // Autocierre de cada toast a los 12s para que no se acumulen en pantalla
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => cerrarToast(t.id), 12000));
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const count = alerts
    ? (alerts.avisos?.length ?? 0) +
      (alerts.aprobaciones?.length ?? 0) +
      alerts.tareas.length +
      alerts.posventa.length +
      alerts.estancadas.length +
      (alerts.mensajesCliente?.length ?? 0)
    : 0;

  // Al abrir un aviso de workflow se marca leído y sale de la lista
  const dismissAviso = (id: string) => {
    fetch("/api/alertas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avisoId: id }),
    }).catch(() => {});
    setAlerts((prev) =>
      prev ? { ...prev, avisos: prev.avisos?.filter((a) => a.id !== id) } : prev
    );
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Recordatorios y alertas"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path
            d="M12 4a6 6 0 0 0-6 6v3.2l-1.4 2.9a.8.8 0 0 0 .7 1.1h13.4a.8.8 0 0 0 .7-1.1L18 13.2V10a6 6 0 0 0-6-6z"
            strokeLinejoin="round"
          />
          <path d="M9.8 19.5a2.3 2.3 0 0 0 4.4 0" strokeLinecap="round" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-16 z-50 rounded-xl border border-slate-200 bg-white p-2 shadow-xl lg:absolute lg:inset-x-auto lg:left-0 lg:top-11 lg:w-80">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Recordatorios {count > 0 && `(${count})`}
          </p>

          {count === 0 && (
            <p className="px-3 pb-3 text-sm text-slate-500">🎉 Todo al día. Sin pendientes urgentes.</p>
          )}

          {alerts && (alerts.avisos?.length ?? 0) > 0 && (
            <div className="border-t border-slate-100 py-1">
              {alerts.avisos!.map((a) => (
                <Link
                  key={a.id}
                  href={a.url || "/"}
                  onClick={() => {
                    dismissAviso(a.id);
                    setOpen(false);
                  }}
                  className="block rounded-lg px-3 py-2 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-teal-600">📣 {a.titulo}</p>
                  {a.cuerpo && <p className="truncate text-xs text-slate-600">{a.cuerpo}</p>}
                </Link>
              ))}
            </div>
          )}

          {alerts && (alerts.aprobaciones?.length ?? 0) > 0 && (
            <div className="border-t border-slate-100 py-1">
              {alerts.aprobaciones!.map((a) => (
                <Link
                  key={a.id}
                  href="/aprobaciones"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-purple-600">
                    ✋ {a.tipo} por aprobar
                  </p>
                  <p className="truncate text-xs text-slate-600">
                    {a.titulo} · pide {a.solicitante}
                  </p>
                </Link>
              ))}
            </div>
          )}

          {alerts && (alerts.mensajesCliente?.length ?? 0) > 0 && (
            <div className="border-t border-slate-100 py-1">
              {alerts.mensajesCliente!.map((m) => (
                <Link
                  key={m.id}
                  href={`/empresas/${m.companyId}#chat`}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-teal-700">💬 Mensaje de {m.cliente}</p>
                  <p className="truncate text-xs text-slate-600">{m.extracto}</p>
                </Link>
              ))}
            </div>
          )}

          {alerts && alerts.tareas.length > 0 && (
            <div className="border-t border-slate-100 py-1">
              {alerts.tareas.map((t) => (
                <Link
                  key={t.id}
                  href="/tareas"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-red-600">⏰ Tarea vencida</p>
                  <p className="truncate text-xs text-slate-600">
                    {t.titulo}
                    {t.contacto && ` · ${t.contacto}`}
                  </p>
                </Link>
              ))}
            </div>
          )}

          {alerts && alerts.posventa.length > 0 && (
            <div className="border-t border-slate-100 py-1">
              {alerts.posventa.map((f) => (
                <Link
                  key={f.id}
                  href="/posventa"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-amber-600">💛 Posventa por contactar</p>
                  <p className="truncate text-xs text-slate-600">
                    {f.cliente} · {f.negocio}
                  </p>
                </Link>
              ))}
            </div>
          )}

          {alerts && alerts.estancadas.length > 0 && (
            <div className="border-t border-slate-100 py-1">
              {alerts.estancadas.map((d) => (
                <Link
                  key={d.id}
                  href="/pipeline"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-blue-600">🧊 Oportunidad estancada</p>
                  <p className="truncate text-xs text-slate-600">
                    {d.titulo} · {d.dias} días sin movimiento
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Avisos flotantes de mensajes nuevos — en un portal a <body>, porque el
          Sidebar móvil usa transition-transform y eso vuelve "fixed" relativo
          a él en vez de a toda la pantalla si se renderiza aquí adentro. */}
      {toasts.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
            {toasts.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-3 rounded-xl border border-teal-200 bg-white p-4 shadow-lg ring-1 ring-black/5 animate-[toast-in_0.2s_ease-out]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white">
                  💬
                </span>
                <Link
                  href={`/empresas/${m.companyId}#chat`}
                  onClick={() => cerrarToast(m.id)}
                  className="min-w-0 flex-1"
                >
                  <p className="text-sm font-semibold text-slate-900">Mensaje de {m.cliente}</p>
                  <p className="truncate text-xs text-slate-500">{m.extracto}</p>
                </Link>
                <button
                  onClick={() => cerrarToast(m.id)}
                  aria-label="Cerrar aviso"
                  className="shrink-0 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
