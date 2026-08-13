// Vocabulario puro de la "línea de tiempo de servicios" — la misma que ve el
// gestor en la ficha del cliente (app/(crm)/empresas/[id]/page.tsx) y el
// cliente en su portal (app/portal/(app)/page.tsx). Mismos 3 colores, mismo
// componente visual (components/servicios/LineaServiciosTimeline.tsx); cada
// página arma su propio array de items con los datos que ya tiene cargados.

export type ColorServicio = "verde" | "naranja" | "gris";

export type ItemLineaServicio = {
  id: string;
  nombre: string;
  detalle: string;
  color: ColorServicio;
};

// Una obligación del plan sin caso abierto en el período en curso todavía no
// se ha comenzado a trabajar; con caso presentado, culminada; cualquier otro
// estado del caso (o vencido) sigue pendiente.
export function colorObligacion(estadoCasoDelPeriodo: string | undefined): ColorServicio {
  if (!estadoCasoDelPeriodo) return "gris";
  return estadoCasoDelPeriodo === "presentado" ? "verde" : "naranja";
}

// Un servicio individual "cotizado" aún no arrancó; entregado/facturado ya
// culminó; aprobado/en_ejecucion está en curso.
export function colorServicioIndividual(estado: string): ColorServicio {
  if (estado === "cotizado") return "gris";
  return estado === "entregado" || estado === "facturado" ? "verde" : "naranja";
}
