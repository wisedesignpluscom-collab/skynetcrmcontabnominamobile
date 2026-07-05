"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Alerts = {
  aprobaciones?: { id: string; titulo: string; tipo: string; solicitante: string }[];
  tareas: { id: string; titulo: string; contacto: string | null }[];
  posventa: { id: string; cliente: string; negocio: string }[];
  estancadas: { id: string; titulo: string; dias: number }[];
};

export default function NotificationsBell() {
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Cargar alertas al entrar, al navegar y cada 60 segundos
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/alertas")
        .then((r) => r.json())
        .then((data) => active && setAlerts(data))
        .catch(() => {});
    load();
    const interval = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pathname]);

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
    ? (alerts.aprobaciones?.length ?? 0) +
      alerts.tareas.length +
      alerts.posventa.length +
      alerts.estancadas.length
    : 0;

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
    </div>
  );
}
