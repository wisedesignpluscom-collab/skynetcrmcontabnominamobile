// El loop mensual (F4) — lado servidor.
//
// Tres operaciones, y ninguna inventa trabajo por su cuenta:
//   · generarCasosDelPeriodo — abre los casos del período en curso a partir de
//     los planes ACTIVOS (F3), con la fecha límite del motor (F2).
//   · clonarSiguientePeriodo — al presentar un caso, abre el del período que
//     sigue. Lo invoca el Automation Engine, no el CRM directamente.
//   · marcarVencidos — pasa a «vencido» lo que se le fue la fecha y emite
//     caso.vencido para que las reglas avisen.
//
// La barrera contra duplicados NO es la lógica de aquí sino el índice único
// [companyId, obligacionId, periodoFiscal]: aunque dos caminos intenten abrir
// el mismo caso, la base solo deja uno.

import { prisma } from "@/lib/prisma";
import { debeMarcarseVencido } from "@/lib/casos";
import { planProduceTrabajo } from "@/lib/planes";
import { periodoSiguiente, type Periodicidad } from "./vencimientos";
import { contextoFiscal, vencimientoDelPlan, periodoActual, type ContextoFiscal } from "./data";

export type ResultadoGeneracion = {
  creados: number;
  yaExistian: number;
  // Casos abiertos sin fecha calculable (obligación manual, falta calendario…)
  sinFecha: number;
  detalle: string[];
};

type CasoNuevo = {
  companyId: string;
  obligacionId: string;
  periodoFiscal: string;
  fechaLimite: Date | null;
  analistaId: string | null;
  supervisorId: string | null;
};

// Crea el caso si no existe. Devuelve el registro creado o null si ya estaba
// (choque del índice único: dos procesos abriendo el mismo período a la vez).
async function abrirCaso(caso: CasoNuevo) {
  const existente = await prisma.casoRecurrente.findUnique({
    where: {
      companyId_obligacionId_periodoFiscal: {
        companyId: caso.companyId,
        obligacionId: caso.obligacionId,
        periodoFiscal: caso.periodoFiscal,
      },
    },
    select: { id: true },
  });
  if (existente) return null;

  try {
    return await prisma.casoRecurrente.create({ data: caso });
  } catch (e) {
    // P2002 = el índice único lo frenó (carrera): no es un error de negocio
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") return null;
    throw e;
  }
}

// Abre los casos del período en curso de cada obligación contratada. Idempotente:
// correrlo dos veces no duplica nada.
export async function generarCasosDelPeriodo(opciones?: {
  companyId?: string;
  hoy?: Date;
}): Promise<ResultadoGeneracion> {
  const hoy = opciones?.hoy ?? new Date();
  const planes = await prisma.planServicio.findMany({
    where: {
      estado: "activo",
      ...(opciones?.companyId ? { companyId: opciones.companyId } : {}),
    },
    include: {
      company: { select: { id: true, name: true, rif: true, municipios: true, analistaId: true, supervisorId: true } },
      obligaciones: { include: { obligacion: true } },
    },
  });

  const res: ResultadoGeneracion = { creados: 0, yaExistian: 0, sinFecha: 0, detalle: [] };
  // Un contexto fiscal por municipio (los feriados municipales difieren)
  const contextos = new Map<string, ContextoFiscal>();

  for (const plan of planes) {
    if (!planProduceTrabajo(plan.estado)) continue;
    const clave = plan.company.municipios ?? "";
    if (!contextos.has(clave)) {
      contextos.set(clave, await contextoFiscal(hoy.getFullYear(), plan.company.municipios));
    }
    const ctx = contextos.get(clave)!;

    for (const po of plan.obligaciones) {
      const periodo = periodoActual(po.obligacion.periodicidad, hoy);
      const v = vencimientoDelPlan(ctx, po.obligacion, po.diaLimiteOverride, periodo, plan.company.rif);

      const creado = await abrirCaso({
        companyId: plan.companyId,
        obligacionId: po.obligacionId,
        periodoFiscal: periodo,
        fechaLimite: v.fecha,
        analistaId: plan.company.analistaId,
        supervisorId: plan.company.supervisorId,
      });

      if (!creado) {
        res.yaExistian++;
        continue;
      }
      res.creados++;
      if (!v.fecha) {
        res.sinFecha++;
        res.detalle.push(`${plan.company.name} · ${po.obligacion.nombre}: ${v.motivo ?? "sin fecha"}`);
      }
    }
  }

  return res;
}

// Al presentar un caso se abre el del período siguiente. Nace en
// «pendiente_cliente» — nunca en «presentado» —, así no vuelve a disparar el
// clonado: ese es el guard real del loop, más allá de MAX_EVENT_DEPTH.
export async function clonarSiguientePeriodo(casoId: string): Promise<{
  creado: { id: string; periodoFiscal: string; fechaLimite: Date | null } | null;
  motivo?: string;
}> {
  const caso = await prisma.casoRecurrente.findUnique({
    where: { id: casoId },
    include: {
      obligacion: true,
      company: { select: { rif: true, municipios: true, analistaId: true, supervisorId: true } },
    },
  });
  if (!caso) return { creado: null, motivo: "El caso ya no existe." };

  const siguiente = periodoSiguiente(
    caso.periodoFiscal,
    caso.obligacion.periodicidad as Periodicidad
  );
  if (!siguiente) {
    return { creado: null, motivo: `No se pudo calcular el período siguiente a «${caso.periodoFiscal}».` };
  }

  // El plan puede haberse pausado o cancelado entre un período y el otro: si ya
  // no produce trabajo, el loop se detiene solo.
  const plan = await prisma.planServicio.findUnique({
    where: { companyId: caso.companyId },
    include: { obligaciones: { where: { obligacionId: caso.obligacionId } } },
  });
  if (!plan || !planProduceTrabajo(plan.estado)) {
    return { creado: null, motivo: "El plan del cliente ya no está activo: el loop se detiene." };
  }
  if (plan.obligaciones.length === 0) {
    return { creado: null, motivo: "La obligación ya no forma parte del plan del cliente." };
  }

  const anio = Number(siguiente.slice(0, 4)) || new Date().getFullYear();
  const ctx = await contextoFiscal(anio, caso.company.municipios);
  const v = vencimientoDelPlan(
    ctx,
    caso.obligacion,
    plan.obligaciones[0].diaLimiteOverride,
    siguiente,
    caso.company.rif
  );

  const creado = await abrirCaso({
    companyId: caso.companyId,
    obligacionId: caso.obligacionId,
    periodoFiscal: siguiente,
    fechaLimite: v.fecha,
    analistaId: caso.company.analistaId ?? caso.analistaId,
    supervisorId: caso.company.supervisorId ?? caso.supervisorId,
  });

  if (!creado) return { creado: null, motivo: `El caso de ${siguiente} ya estaba abierto.` };
  return { creado: { id: creado.id, periodoFiscal: creado.periodoFiscal, fechaLimite: creado.fechaLimite } };
}

// Marca vencido lo que pasó su fecha sin presentarse. Devuelve los casos que
// cambiaron para que quien llama emita «caso.vencido» (aquí no se emite para no
// crear un ciclo de imports con el engine).
export async function marcarVencidos(hoy = new Date()): Promise<
  { id: string; record: Record<string, unknown> }[]
> {
  const candidatos = await prisma.casoRecurrente.findMany({
    where: {
      estado: { notIn: ["presentado", "vencido"] },
      fechaLimite: { not: null, lt: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) },
    },
    include: { company: true, obligacion: true },
    take: 500,
  });

  const cambiados: { id: string; record: Record<string, unknown> }[] = [];
  for (const caso of candidatos) {
    // Se re-verifica con el helper puro: la consulta filtra por fecha, pero la
    // regla de negocio de «qué es estar vencido» vive en un solo lugar.
    if (!debeMarcarseVencido(caso.fechaLimite, caso.estado, hoy)) continue;
    const actualizado = await prisma.casoRecurrente.update({
      where: { id: caso.id },
      data: { estado: "vencido" },
      include: { company: true, obligacion: true },
    });
    cambiados.push({ id: caso.id, record: actualizado as unknown as Record<string, unknown> });
  }
  return cambiados;
}
