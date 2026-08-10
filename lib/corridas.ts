// Operación de Nómina (Etapa 2.5) — períodos de corrida, vocabulario y
// heurística de auditoría. Módulo puro, sin Prisma ni Next.
//
// Los períodos mensual/quincenal reutilizan el mismo formato y aritmética
// que lib/fiscal/vencimientos.ts ("2026-07" / "2026-07-Q1") — son el mismo
// calendario, aunque representen un concepto de negocio distinto (corrida de
// nómina, no obligación fiscal). Semanal es nuevo aquí: se identifica por la
// fecha (mediodía local) del lunes de esa semana, "2026-08-03".

import {
  fechaLocal,
  claveDia,
  diasDelMes,
  addMonths,
  parsePeriodo,
  formatPeriodo,
  etiquetaPeriodo as etiquetaPeriodoFiscal,
} from "./fiscal/vencimientos";
import type { FrecuenciaPago } from "./jornadas";

export type RangoFechas = { inicio: Date; fin: Date };

// Lunes de la semana que contiene `fecha` (mediodía local).
function lunesDeLaSemana(fecha: Date): Date {
  const dia = fecha.getDay(); // 0=domingo…6=sábado
  const offset = dia === 0 ? -6 : 1 - dia;
  const d = new Date(fecha);
  d.setDate(d.getDate() + offset);
  return fechaLocal(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const SEMANA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function periodoActualNomina(frecuencia: FrecuenciaPago, hoy: Date = new Date()): string {
  if (frecuencia === "semanal") return claveDia(lunesDeLaSemana(hoy));
  const quincena: 1 | 2 | undefined = frecuencia === "quincenal" ? (hoy.getDate() <= 15 ? 1 : 2) : undefined;
  return formatPeriodo({ anio: hoy.getFullYear(), mes: hoy.getMonth() + 1, quincena });
}

export function rangoPeriodoNomina(periodo: string, frecuencia: FrecuenciaPago): RangoFechas | null {
  if (frecuencia === "semanal") {
    const m = SEMANA_RE.exec(periodo);
    if (!m) return null;
    const inicio = fechaLocal(Number(m[1]), Number(m[2]), Number(m[3]));
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    return { inicio, fin: fechaLocal(fin.getFullYear(), fin.getMonth() + 1, fin.getDate()) };
  }
  const p = parsePeriodo(periodo);
  if (!p) return null;
  if (frecuencia === "quincenal") {
    if (p.quincena === 2) return { inicio: fechaLocal(p.anio, p.mes, 16), fin: fechaLocal(p.anio, p.mes, diasDelMes(p.anio, p.mes)) };
    return { inicio: fechaLocal(p.anio, p.mes, 1), fin: fechaLocal(p.anio, p.mes, 15) };
  }
  return { inicio: fechaLocal(p.anio, p.mes, 1), fin: fechaLocal(p.anio, p.mes, diasDelMes(p.anio, p.mes)) };
}

// La base declarada (Etapa 1, siempre mensual — "2026-07") se prorratea por
// los días del período de la corrida: mensual = 100%, quincenal ≈ 50%,
// semanal ≈ 23%. Un solo cálculo para las tres frecuencias en vez de tres
// reglas distintas (ej.: "dividir entre 2" no serviría para semanal).
export function baseProrrateada(baseMensual: number, diasPeriodo: number, diasMes: number): number {
  if (diasMes <= 0) return 0;
  return (baseMensual * diasPeriodo) / diasMes;
}

// Mes ("2026-07") al que pertenece un período de corrida — es la clave con la
// que se busca la DeclaracionNomina del trabajador (Etapa 1, siempre mensual),
// sin importar si la corrida es mensual, quincenal o semanal.
export function mesDeclaracionDelPeriodo(periodo: string, frecuencia: FrecuenciaPago): string | null {
  const rango = rangoPeriodoNomina(periodo, frecuencia);
  if (!rango) return null;
  return formatPeriodo({ anio: rango.inicio.getFullYear(), mes: rango.inicio.getMonth() + 1 });
}

// Cada día del período (para las columnas del grid de asistencia).
export function diasDelPeriodoNomina(periodo: string, frecuencia: FrecuenciaPago): Date[] {
  const rango = rangoPeriodoNomina(periodo, frecuencia);
  if (!rango) return [];
  const dias: Date[] = [];
  const cursor = new Date(rango.inicio);
  while (cursor.getTime() <= rango.fin.getTime()) {
    dias.push(fechaLocal(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

export function periodoSiguienteNomina(periodo: string, frecuencia: FrecuenciaPago): string | null {
  if (frecuencia === "semanal") {
    const m = SEMANA_RE.exec(periodo);
    if (!m) return null;
    const inicio = fechaLocal(Number(m[1]), Number(m[2]), Number(m[3]));
    inicio.setDate(inicio.getDate() + 7);
    return claveDia(inicio);
  }
  if (frecuencia === "quincenal") {
    const p = parsePeriodo(periodo);
    if (!p) return null;
    if ((p.quincena ?? 1) === 1) return formatPeriodo({ anio: p.anio, mes: p.mes, quincena: 2 });
    const sig = addMonths(fechaLocal(p.anio, p.mes, 1), 1);
    return formatPeriodo({ anio: sig.getFullYear(), mes: sig.getMonth() + 1, quincena: 1 });
  }
  const p = parsePeriodo(periodo);
  if (!p) return null;
  const sig = addMonths(fechaLocal(p.anio, p.mes, 1), 1);
  return formatPeriodo({ anio: sig.getFullYear(), mes: sig.getMonth() + 1 });
}

export function periodoAnteriorNomina(periodo: string, frecuencia: FrecuenciaPago): string | null {
  if (frecuencia === "semanal") {
    const m = SEMANA_RE.exec(periodo);
    if (!m) return null;
    const inicio = fechaLocal(Number(m[1]), Number(m[2]), Number(m[3]));
    inicio.setDate(inicio.getDate() - 7);
    return claveDia(inicio);
  }
  if (frecuencia === "quincenal") {
    const p = parsePeriodo(periodo);
    if (!p) return null;
    if ((p.quincena ?? 1) === 2) return formatPeriodo({ anio: p.anio, mes: p.mes, quincena: 1 });
    const ant = addMonths(fechaLocal(p.anio, p.mes, 1), -1);
    return formatPeriodo({ anio: ant.getFullYear(), mes: ant.getMonth() + 1, quincena: 2 });
  }
  const p = parsePeriodo(periodo);
  if (!p) return null;
  const ant = addMonths(fechaLocal(p.anio, p.mes, 1), -1);
  return formatPeriodo({ anio: ant.getFullYear(), mes: ant.getMonth() + 1 });
}

export function etiquetaPeriodoNomina(periodo: string, frecuencia: FrecuenciaPago): string {
  if (frecuencia === "semanal") {
    const rango = rangoPeriodoNomina(periodo, frecuencia);
    if (!rango) return periodo;
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `Semana ${fmt(rango.inicio)}–${fmt(rango.fin)}/${rango.fin.getFullYear()}`;
  }
  return etiquetaPeriodoFiscal(periodo);
}

// ── Corrida de nómina ────────────────────────────────────────────────────────

export const ESTADOS_CORRIDA = ["borrador", "calculada"] as const;
export type EstadoCorrida = (typeof ESTADOS_CORRIDA)[number];

export const estadoCorridaLabels: Record<string, string> = {
  borrador: "Borrador",
  calculada: "Calculada",
};

export const estadoCorridaClass: Record<string, string> = {
  borrador: "bg-slate-100 text-slate-600",
  calculada: "bg-emerald-50 text-emerald-700",
};

// Auditoría: cruce contra el histórico (misma heurística que el riesgo FAO de
// la Etapa 1 — caída brusca vs. el período anterior, umbral configurable).
// Sin corrida anterior no hay con qué comparar: nunca se marca alerta por
// defecto.
export function auditarCorrida(params: {
  totalNeto: number;
  totalNetoAnterior: number | null;
  umbral?: number;
}): { alerta: boolean; detalle: string | null } {
  const umbral = params.umbral ?? 0.2;
  if (params.totalNetoAnterior == null || params.totalNetoAnterior <= 0) {
    return { alerta: false, detalle: null };
  }
  const variacion = (params.totalNeto - params.totalNetoAnterior) / params.totalNetoAnterior;
  if (variacion <= -umbral) {
    return {
      alerta: true,
      detalle: `El neto total cayó ${(Math.abs(variacion) * 100).toFixed(1)}% respecto al período anterior`,
    };
  }
  if (variacion >= umbral) {
    return {
      alerta: true,
      detalle: `El neto total subió ${(variacion * 100).toFixed(1)}% respecto al período anterior`,
    };
  }
  return { alerta: false, detalle: null };
}
