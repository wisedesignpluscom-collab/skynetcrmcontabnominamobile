"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationsBell from "./NotificationsBell";
import { logout } from "@/app/login/actions";

const navItems = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/contactos",
    label: "Contactos",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" strokeLinecap="round" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M16 15.2c2.4.2 4.6 1.7 5.3 4.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/empresas",
    label: "Clientes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
        <path d="M14 9h5a1 1 0 0 1 1 1v11" />
        <path d="M2 21h20" strokeLinecap="round" />
        <path d="M7.5 8h3M7.5 12h3M7.5 16h3M17 13h.5M17 17h.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/casos",
    label: "Casos",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M8 3h8a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2V4a1 1 0 0 1 1-1z" />
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/nomina",
    label: "Nómina",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <circle cx="8.5" cy="7.5" r="2.8" />
        <circle cx="16.5" cy="8.5" r="2.3" />
        <path d="M2.5 20c.7-3.6 3-5.6 6-5.6s5.3 2 6 5.6" strokeLinecap="round" />
        <path d="M14.5 14.7c2.6.1 4.5 1.9 5 5.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/riesgo-nomina",
    label: "Riesgo de nómina",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M12 3l9 16H3l9-16z" strokeLinejoin="round" />
        <path d="M12 10v4" strokeLinecap="round" />
        <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/facturacion",
    label: "Facturación",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1z" />
        <path d="M9 8h6M9 12h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="4" width="5" height="16" rx="1.2" />
        <rect x="10" y="4" width="5" height="11" rx="1.2" />
        <rect x="17" y="4" width="5" height="7" rx="1.2" />
      </svg>
    ),
  },
  {
    href: "/tareas",
    label: "Tareas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8.5 9l2 2 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 15.5h7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/calendario",
    label: "Calendario",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v3M16 3v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/posventa",
    label: "Posventa",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M12 21s-7.5-4.6-9.5-9.4C1 7.8 3.5 4.5 7 4.5c2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 3.5 0 6 3.3 4.5 7.1C19.5 16.4 12 21 12 21z" strokeLinejoin="round" />
        <path d="M8 12h2.5l1.5-2.5 2 4 1.5-1.5H17" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/reportes",
    label: "Reportes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M4 19V10M10 19V4M16 19v-8" strokeLinecap="round" />
        <path d="M3 21h18" strokeLinecap="round" />
      </svg>
    ),
  },
];

const approverItems = [
  {
    href: "/aprobaciones",
    label: "Aprobaciones",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 3v2.5h6V3" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const adminItems = [
  {
    href: "/usuarios",
    label: "Usuarios",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.9-3.5 3.8-5.5 7-5.5s6.1 2 7 5.5" strokeLinecap="round" />
        <path d="M17.5 3.8a3.5 3.5 0 0 1 0 6.9M20.5 13.5c1.2.8 2.1 2 2.5 3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/automatizaciones",
    label: "Automatizaciones",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M13 2L4.5 13.5H11L9.5 22 19.5 9.5H13L13 2z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/plantillas",
    label: "Plantillas de correo",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3.5 7l8.5 6 8.5-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/configuracion",
    label: "Configuración",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.7-1.6L13.4 2h-3l-.4 2.9a7 7 0 0 0-2.7 1.6l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .5.1 1.1.2 1.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.7 1.6l.4 2.9h3l.4-2.9a7 7 0 0 0 2.7-1.6l2.3 1 2-3.4-2-1.5c.1-.5.2-1 .2-1.6z" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function Sidebar({
  userName,
  userRole,
}: {
  userName?: string;
  userRole?: string;
}) {
  const pathname = usePathname();
  // El menú móvil se cierra al navegar. En vez de un efecto que llama setState
  // tras pintar (cascada de renders), se guarda la ruta con la que se abrió: si
  // la actual es otra, el menú ya está cerrado en este mismo render.
  const [menu, setMenu] = useState({ open: false, ruta: pathname });
  const open = menu.open && menu.ruta === pathname;
  const setOpen = (v: boolean) => setMenu({ open: v, ruta: pathname });
  const isApprover = userRole === "admin" || userRole === "supervisor";
  const items = [
    ...navItems,
    ...(isApprover ? approverItems : []),
    ...(userRole === "admin" ? adminItems : []),
  ];

  return (
    <>
      {/* Barra superior móvil */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 bg-slate-900 px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          title="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400 to-blue-600 text-sm font-bold text-white">
          S
        </div>
        <p className="flex-1 truncate text-base font-semibold text-white">Skynet CRM</p>
      </header>

      {/* Fondo oscurecido al abrir el menú móvil */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-slate-900 text-slate-300 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-blue-600 font-bold text-white">
          S
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight text-white">Skynet CRM</p>
          <p className="text-[11px] text-slate-400">Ventas y posventa</p>
        </div>
        <NotificationsBell />
        <button
          onClick={() => setOpen(false)}
          title="Cerrar menú"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 lg:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Navegación */}
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-teal-500/15 text-teal-300"
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Pie: usuario y salir */}
      <div className="border-t border-slate-800 px-4 py-4">
        {userName && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">
                {userName[0]?.toUpperCase()}
              </span>
              <span className="truncate text-xs font-medium text-slate-300">{userName}</span>
            </div>
            <form action={logout}>
              <button
                type="submit"
                title="Cerrar sesión"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800 hover:text-red-400"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" strokeLinecap="round" />
                  <path d="M10 8l-4 4 4 4M6 12h9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">v0.1 — versión de desarrollo</p>
      </div>
      </aside>
    </>
  );
}
