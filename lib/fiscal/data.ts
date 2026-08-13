// Puente entre el motor puro de vencimientos y la base de datos.
//
// El motor (lib/fiscal/vencimientos.ts) no sabe de Prisma: recibe los feriados y
// el calendario del SENIAT ya cargados. Aquí se leen esas tablas y se arma el
// «contexto fiscal» de un año, que se reutiliza para calcular muchos
// vencimientos de una sola pasada (lo necesitará el barrido mensual de F4).

import { prisma } from "@/lib/prisma";
import {
  calcularVencimiento,
  claveDia,
  parsePeriodo,
  type EntradaCalendario,
  type Periodicidad,
  type ReglaObligacion,
  type Vencimiento,
} from "./vencimientos";

export type ContextoFiscal = {
  anio: number;
  feriados: Set<string>;
  calendario: EntradaCalendario[];
};

// Feriados del año: los nacionales (municipio vacío) más los del municipio pedido.
export async function cargarFeriados(anio: number, municipio?: string | null): Promise<Set<string>> {
  const desde = new Date(anio, 0, 1);
  const hasta = new Date(anio + 1, 0, 1);
  const filas = await prisma.diaNoHabil.findMany({
    where: {
      fecha: { gte: desde, lt: hasta },
      municipio: municipio ? { in: ["", municipio] } : "",
    },
    select: { fecha: true },
  });
  return new Set(filas.map((f) => claveDia(f.fecha)));
}

export async function cargarCalendarioSeniat(anio: number): Promise<EntradaCalendario[]> {
  const filas = await prisma.calendarioSeniat.findMany({
    where: { anio },
    select: { anio: true, tipo: true, periodicidad: true, digito: true, mes: true, quincena: true, diaDelMes: true },
  });
  return filas;
}

// El vencimiento cae en el mes siguiente al de cierre, así que un período de
// diciembre necesita el contexto del año entrante: se cargan ambos años.
export async function contextoFiscal(anio: number, municipio?: string | null): Promise<ContextoFiscal> {
  const [feriadosA, feriadosB, calA, calB] = await Promise.all([
    cargarFeriados(anio, municipio),
    cargarFeriados(anio + 1, municipio),
    cargarCalendarioSeniat(anio),
    cargarCalendarioSeniat(anio + 1),
  ]);
  return {
    anio,
    feriados: new Set([...feriadosA, ...feriadosB]),
    // Los dos años van juntos (no uno u otro): el día ahora varía por mes, así
    // que un período de diciembre necesita la fila de ESTE año (columna
    // diciembre) aunque venza en enero del año siguiente — el motor filtra por
    // `anio` de cada fila, no por cuál de los dos arrays vino.
    calendario: [...calA, ...calB],
  };
}

export type ObligacionCalculable = ReglaObligacion & { municipio?: string | null };

// Vencimiento de una obligación para un período, cargando lo que haga falta.
// Para calcular muchos, usar `contextoFiscal` una vez y `conContexto`.
export async function vencimientoDe(
  obligacion: ObligacionCalculable,
  periodo: string,
  rif?: string | null
): Promise<Vencimiento> {
  const p = parsePeriodo(periodo);
  if (!p) return calcularVencimiento({ obligacion, periodo, rif });
  const ctx = await contextoFiscal(p.anio, obligacion.municipio);
  return conContexto(ctx, obligacion, periodo, rif);
}

export function conContexto(
  ctx: ContextoFiscal,
  obligacion: ObligacionCalculable,
  periodo: string,
  rif?: string | null
): Vencimiento {
  return calcularVencimiento({
    obligacion,
    periodo,
    rif,
    feriados: ctx.feriados,
    calendario: ctx.calendario,
  });
}

// Vencimiento de una obligación tal como quedó contratada en el plan del
// cliente: si el plan acordó un día distinto, ese día manda sobre la regla del
// catálogo (se trata como «día fijo», corriéndose al siguiente hábil).
export function vencimientoDelPlan(
  ctx: ContextoFiscal,
  obligacion: ObligacionCalculable,
  diaLimiteOverride: number | null | undefined,
  periodo: string,
  rif?: string | null
): Vencimiento {
  if (diaLimiteOverride && diaLimiteOverride >= 1 && diaLimiteOverride <= 31) {
    return conContexto(
      ctx,
      { ...obligacion, reglaTipo: "dia_fijo", reglaParam: diaLimiteOverride },
      periodo,
      rif
    );
  }
  return conContexto(ctx, obligacion, periodo, rif);
}

// Período fiscal en curso (el mes que se está cerrando) según la periodicidad.
// Lo usará el alta de casos recurrentes en F4.
export function periodoActual(periodicidad: Periodicidad | string, hoy = new Date()): string {
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  if (periodicidad === "quincenal") {
    return `${anio}-${mes}-Q${hoy.getDate() <= 15 ? 1 : 2}`;
  }
  return `${anio}-${mes}`;
}
