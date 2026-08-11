// Segmentación de clientes — lado servidor (Etapa 4 «Mis Consultores»).
// Reúne el insumo real de un Company (plan activo + resumen de casos) y
// delega la regla de negocio al módulo puro. Mismo espíritu que lib/health.ts:
// se puede calcular sin guardar (getSegmentoCompany) o calcular Y cachear en
// el registro (recomputeSegmentoCompany), para no recalcular la cartera
// completa en cada render.

import { prisma } from "@/lib/prisma";
import { resumenCasosPorEmpresa } from "@/lib/fiscal/casos";
import { getConfigSegmentacion } from "@/lib/segmentacionSettings";
import {
  calcularSegmento,
  type ConfigSegmentacion,
  type InsumoSegmentacion,
  type ResultadoSegmentacion,
} from "@/lib/segmentacion";
import type { Moneda } from "@/lib/clientes";

async function gatherInsumo(companyId: string, hoy: Date): Promise<InsumoSegmentacion> {
  const [plan, resumenCasos] = await Promise.all([
    prisma.planServicio.findUnique({
      where: { companyId },
      select: { estado: true, honorarioMensual: true, moneda: true },
    }),
    resumenCasosPorEmpresa(companyId, hoy),
  ]);

  const planActivo = plan?.estado === "activo";
  return {
    honorarioMensual: planActivo ? (plan?.honorarioMensual ?? null) : null,
    monedaHonorario: planActivo ? ((plan?.moneda as Moneda | undefined) ?? null) : null,
    casosAbiertos: resumenCasos.abiertos,
    casosProblematicos: resumenCasos.problematicos,
  };
}

// Calcula SIN guardar (para mostrar un desglose siempre fresco, ej. en la
// ficha del cliente antes de decidir si vale la pena recalcular la cartera).
export async function getSegmentoCompany(
  companyId: string,
  hoy = new Date()
): Promise<ResultadoSegmentacion> {
  const [insumo, config] = await Promise.all([
    gatherInsumo(companyId, hoy),
    getConfigSegmentacion(),
  ]);
  return calcularSegmento(insumo, config);
}

// Calcula Y GUARDA (caché para listar/filtrar la cartera sin recalcular cada
// cliente en cada render). Devuelve también si la categoría cambió, para que
// quien llama decida si emite el evento del Automation Engine (Etapa 4.3 —
// separado a propósito, este módulo no importa el motor).
export async function recomputeSegmentoCompany(
  companyId: string,
  config?: ConfigSegmentacion,
  hoy = new Date()
): Promise<{ resultado: ResultadoSegmentacion; categoriaAnterior: string | null; cambio: boolean }> {
  const [insumo, cfg, company] = await Promise.all([
    gatherInsumo(companyId, hoy),
    config ? Promise.resolve(config) : getConfigSegmentacion(),
    prisma.company.findUnique({ where: { id: companyId }, select: { segmentoCategoria: true } }),
  ]);

  const resultado = calcularSegmento(insumo, cfg);
  const categoriaAnterior = company?.segmentoCategoria ?? null;

  await prisma.company.update({
    where: { id: companyId },
    data: {
      segmentoCategoria: resultado.categoria,
      segmentoMotivos: JSON.stringify(resultado.motivos),
      segmentoComputadoAt: hoy,
    },
  });

  return { resultado, categoriaAnterior, cambio: categoriaAnterior !== resultado.categoria };
}

// Recalcula toda la cartera (barrido periódico, backfill y al cambiar la
// config de umbrales). Devuelve los clientes cuya categoría cambió, para que
// el llamador (con acceso al motor) emita los eventos correspondientes.
export async function recomputeAllSegmentos(
  hoy = new Date()
): Promise<{ id: string; categoriaAnterior: string | null; categoria: string }[]> {
  const config = await getConfigSegmentacion();
  const empresas = await prisma.company.findMany({ select: { id: true } });
  const cambios: { id: string; categoriaAnterior: string | null; categoria: string }[] = [];
  for (const { id } of empresas) {
    const { resultado, categoriaAnterior, cambio } = await recomputeSegmentoCompany(id, config, hoy);
    if (cambio) cambios.push({ id, categoriaAnterior, categoria: resultado.categoria });
  }
  return cambios;
}
