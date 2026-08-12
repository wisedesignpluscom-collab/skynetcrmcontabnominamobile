"use client";

// Sensación de "tiempo real" sin websockets ni una API nueva: refresca los
// Server Components de la página a intervalos regulares (mismo espíritu que el
// polling de NotificationsBell, pero vía router.refresh() en vez de fetch).
// No renderiza nada — se monta una vez junto al contenido que debe refrescarse.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
