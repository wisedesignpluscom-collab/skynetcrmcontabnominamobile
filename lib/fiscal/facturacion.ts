// Generación de la facturación (F6) — lado servidor.
//
// Decisión de diseño: **emitir el cobro lo hace el sistema, no una regla
// configurable**. El plan original lo planteaba como una regla del Builder, pero
// el dinero no puede depender de que alguien deje encendido un interruptor: si
// alguien desactiva la regla, la firma deja de facturar sin que nadie se entere.
// Lo que SÍ deciden las reglas es qué comunicar cuando la factura ya existe
// (evento `factura.emitida`), igual que con los casos vencidos en F4.
//
// La barrera contra el doble cobro no es la lógica de aquí sino el índice único
// [companyId, periodo, tipo, origenId].

import { prisma } from "@/lib/prisma";
import { planProduceTrabajo } from "@/lib/planes";
import { servicioFacturable } from "@/lib/planes";
import { facturaVencida } from "@/lib/facturacion";
import { periodoActual } from "./data";

export type ResultadoFacturacion = {
  emitidas: number;
  yaExistian: number;
  // Facturas nuevas, para que quien llama emita el evento del engine
  nuevas: { id: string; record: Record<string, unknown> }[];
};

// Crea la factura si no existe. Null si ya estaba (índice único / carrera).
async function emitir(data: {
  companyId: string;
  tipo: string;
  origenId: string;
  concepto: string;
  monto: number;
  moneda: string;
  periodo: string;
}) {
  const existente = await prisma.facturacion.findUnique({
    where: {
      companyId_periodo_tipo_origenId: {
        companyId: data.companyId,
        periodo: data.periodo,
        tipo: data.tipo,
        origenId: data.origenId,
      },
    },
    select: { id: true },
  });
  if (existente) return null;

  try {
    return await prisma.facturacion.create({
      data,
      include: { company: true },
    });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") return null;
    throw e;
  }
}

// Honorario mensual de cada plan activo. Idempotente: correrlo varias veces en
// el mismo mes no vuelve a cobrar.
export async function facturarHonorariosDelPeriodo(opciones?: {
  hoy?: Date;
  companyId?: string;
}): Promise<ResultadoFacturacion> {
  const hoy = opciones?.hoy ?? new Date();
  const periodo = periodoActual("mensual", hoy);

  const planes = await prisma.planServicio.findMany({
    where: {
      estado: "activo",
      ...(opciones?.companyId ? { companyId: opciones.companyId } : {}),
    },
    include: { company: { select: { name: true } } },
  });

  const res: ResultadoFacturacion = { emitidas: 0, yaExistian: 0, nuevas: [] };
  for (const plan of planes) {
    // Un plan sin honorario no genera cobro (hay clientes en cortesía o en
    // período de prueba): cobrar cero solo ensucia la bandeja.
    if (!planProduceTrabajo(plan.estado) || plan.honorarioMensual <= 0) continue;

    const factura = await emitir({
      companyId: plan.companyId,
      tipo: "honorario_fijo",
      origenId: plan.id,
      concepto: `Honorario mensual · ${periodo}`,
      monto: plan.honorarioMensual,
      moneda: plan.moneda,
      periodo,
    });

    if (!factura) {
      res.yaExistian++;
      continue;
    }
    res.emitidas++;
    res.nuevas.push({ id: factura.id, record: factura as unknown as Record<string, unknown> });
  }
  return res;
}

// Factura de un servicio individual entregado. La llama la acción que cambia el
// estado del servicio; si el servicio no está entregado, no hace nada.
export async function facturarServicioEntregado(
  servicioId: string,
  hoy = new Date()
): Promise<{ id: string; record: Record<string, unknown> } | null> {
  const servicio = await prisma.servicioIndividual.findUnique({
    where: { id: servicioId },
    include: { company: { select: { name: true } } },
  });
  if (!servicio || !servicioFacturable(servicio.estado) || servicio.montoCotizado <= 0) return null;

  const factura = await emitir({
    companyId: servicio.companyId,
    tipo: "servicio_individual",
    origenId: servicio.id,
    concepto: servicio.descripcion?.trim() ? `${servicio.tipo} · ${servicio.descripcion}` : servicio.tipo,
    monto: servicio.montoCotizado,
    moneda: servicio.moneda,
    periodo: periodoActual("mensual", hoy),
  });
  if (!factura) return null;
  return { id: factura.id, record: factura as unknown as Record<string, unknown> };
}

// Pendientes que pasaron el plazo de cobro. Devuelve cuántas cambiaron.
export async function marcarFacturasVencidas(hoy = new Date()): Promise<number> {
  const pendientes = await prisma.facturacion.findMany({
    where: { estadoPago: "pendiente" },
    select: { id: true, fechaEmision: true },
    take: 500,
  });
  const vencidas = pendientes.filter((f) => facturaVencida("pendiente", f.fechaEmision, hoy));
  if (vencidas.length === 0) return 0;
  await prisma.facturacion.updateMany({
    where: { id: { in: vencidas.map((f) => f.id) } },
    data: { estadoPago: "vencido" },
  });
  return vencidas.length;
}
