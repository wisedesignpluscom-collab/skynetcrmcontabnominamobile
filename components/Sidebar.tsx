"use client";

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
    label: "Empresas",
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
  const isApprover = userRole === "admin" || userRole === "supervisor";
  const items = [
    ...navItems,
    ...(isApprover ? approverItems : []),
    ...(userRole === "admin" ? adminItems : []),
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-slate-900 text-slate-300">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-blue-600 font-bold text-white">
          N
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight text-white">Nogui CRM</p>
          <p className="text-[11px] text-slate-400">Ventas y posventa</p>
        </div>
        <NotificationsBell />
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
  );
}
