"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutPortal } from "@/app/portal/login/actions";

const navItems = [
  {
    href: "/portal",
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
    href: "/portal/chat",
    label: "Chat",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/portal/cuenta",
    label: "Mi cuenta",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.9-3.5 3.8-5.5 7-5.5s6.1 2 7 5.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function PortalShell({
  companyName,
  userName,
  mensajesSinLeer = 0,
  children,
}: {
  companyName: string;
  userName: string;
  mensajesSinLeer?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menu, setMenu] = useState({ open: false, ruta: pathname });
  const open = menu.open && menu.ruta === pathname;
  const setOpen = (v: boolean) => setMenu({ open: v, ruta: pathname });

  return (
    <>
      {/* Barra superior móvil */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 bg-[#150a38] px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          title="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-violet-700 text-sm font-bold text-white">
          S
        </div>
        <p className="flex-1 truncate text-base font-semibold text-white">Portal de clientes</p>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-[#150a38] text-slate-300 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-700 font-bold text-white">
            S
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-tight text-white">Portal de clientes</p>
            <p className="truncate text-[11px] text-slate-400">{companyName}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            title="Cerrar menú"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 lg:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const active = item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-indigo-500/20 text-indigo-300" : "hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.icon}
                {item.label}
                {item.href === "/portal/chat" && mensajesSinLeer > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {mensajesSinLeer}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">
                {userName[0]?.toUpperCase()}
              </span>
              <span className="truncate text-xs font-medium text-slate-300">{userName}</span>
            </div>
            <form action={logoutPortal}>
              <button
                type="submit"
                title="Cerrar sesión"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/10 hover:text-red-400"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" strokeLinecap="round" />
                  <path d="M10 8l-4 4 4 4M6 12h9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Portal de solo lectura</p>
        </div>
      </aside>

      <main className="min-h-screen bg-slate-50 px-4 pb-8 pt-20 lg:ml-60 lg:px-8 lg:pt-8">{children}</main>
    </>
  );
}
