// Cálculos LOTTT (Etapa 2.6) — Vacaciones, Utilidades y Liquidaciones.
// Módulo puro, sin Prisma ni Next.
//
// ⚠️ IMPLEMENTADO CON EL MEJOR ENTENDIMIENTO DISPONIBLE DE LA LOTTT 2012
// (artículos 190, 192, 131-132, 142), citando el artículo en cada función.
// NO ESTÁ VERIFICADO contra una fuente legal — revisar con un abogado
// laboral o el criterio ya usado por la firma antes de aplicarlo a un
// cliente real. En particular, "prestacionesSocialesRetroactivo" implementa
// SOLO el cálculo retroactivo de 30 días por año a salario integral final
// (Art. 142 literal b) — no lleva el histórico de garantía trimestral
// depositada (Art. 142 literal a), que la ley exige comparar y pagar el
// mayor de los dos. Ese histórico no existe todavía en este sistema.

import { fechaLocal } from "./fiscal/vencimientos";

// Años completos de servicio entre dos fechas (sin contar fracción).
export function aniosServicioCompletos(fechaIngreso: Date, fechaCorte: Date): number {
  let anios = fechaCorte.getFullYear() - fechaIngreso.getFullYear();
  const aniversarioEsteAnio = fechaLocal(fechaCorte.getFullYear(), fechaIngreso.getMonth() + 1, fechaIngreso.getDate());
  if (aniversarioEsteAnio.getTime() > fechaCorte.getTime()) anios -= 1;
  return Math.max(0, anios);
}

// Meses completos transcurridos desde el último aniversario de ingreso.
function mesesDesdeUltimoAniversario(fechaIngreso: Date, fechaCorte: Date, aniosCompletos: number): number {
  const ultimoAniversario = fechaLocal(fechaIngreso.getFullYear() + aniosCompletos, fechaIngreso.getMonth() + 1, fechaIngreso.getDate());
  let meses = (fechaCorte.getFullYear() - ultimoAniversario.getFullYear()) * 12 + (fechaCorte.getMonth() - ultimoAniversario.getMonth());
  if (fechaCorte.getDate() < ultimoAniversario.getDate()) meses -= 1;
  return Math.max(0, meses);
}

// Años de servicio para el cálculo retroactivo de prestaciones (Art. 142):
// los años completos, más 1 si la fracción restante supera los 6 meses
// (redondeo a favor del trabajador).
export function aniosServicioParaPrestaciones(fechaIngreso: Date, fechaEgreso: Date): number {
  const completos = aniosServicioCompletos(fechaIngreso, fechaEgreso);
  const mesesFraccion = mesesDesdeUltimoAniversario(fechaIngreso, fechaEgreso, completos);
  return completos + (mesesFraccion > 6 ? 1 : 0);
}

// Días de vacaciones (Art. 190): 15 días hábiles al cumplir el primer año,
// +1 día por cada año adicional de antigüedad, tope 30 (año 16 en adelante).
// Sin un año cumplido todavía, no hay derecho (0).
export function diasVacacionesLegal(aniosAntiguedad: number): number {
  if (aniosAntiguedad < 1) return 0;
  return Math.min(15 + (aniosAntiguedad - 1), 30);
}

// Bono vacacional (Art. 192): misma fórmula y tope que las vacaciones.
export function diasBonoVacacionalLegal(aniosAntiguedad: number): number {
  return diasVacacionesLegal(aniosAntiguedad);
}

// Meses completos trabajados dentro de un año calendario — para prorratear
// utilidades de quien ingresó o egresó a mitad de año.
export function mesesTrabajadosEnAnio(fechaIngreso: Date | null, fechaEgreso: Date | null, anio: number): number {
  const inicioAnio = fechaLocal(anio, 1, 1);
  const finAnio = fechaLocal(anio, 12, 31);
  const desde = fechaIngreso && fechaIngreso.getTime() > inicioAnio.getTime() ? fechaIngreso : inicioAnio;
  const hasta = fechaEgreso && fechaEgreso.getTime() < finAnio.getTime() ? fechaEgreso : finAnio;
  if (desde.getTime() > hasta.getTime()) return 0;
  const meses = (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth()) + 1;
  return Math.max(0, Math.min(12, meses));
}

// Días de utilidades del período, prorrateados por meses trabajados en el
// año (Art. 131-132) — diasAnioConfigurados es el número de días que la
// firma ya definió para ese cliente en Configuración de nómina (2.4), no
// un valor legal fijo: la ley solo pone el piso (30) y el techo (120).
export function diasUtilidadesProporcional(diasAnioConfigurados: number, mesesTrabajados: number): number {
  return (diasAnioConfigurados * mesesTrabajados) / 12;
}

export function salarioDiario(baseMensual: number): number {
  return baseMensual / 30;
}

// Salario integral diario = salario normal + alícuota de utilidades +
// alícuota de bono vacacional, base del cálculo retroactivo de
// prestaciones (Art. 142). Las alícuotas se prorratean sobre 360 días
// (convención de año comercial de 12 meses × 30 días, la misma que ya usa
// el resto del sistema para "sueldo/30").
export function salarioIntegralDiario(baseMensual: number, diasUtilidadesAnio: number, diasBonoVacacional: number): number {
  const diario = salarioDiario(baseMensual);
  const alicuotaUtilidades = (diasUtilidadesAnio * diario) / 360;
  const alicuotaBonoVacacional = (diasBonoVacacional * diario) / 360;
  return diario + alicuotaUtilidades + alicuotaBonoVacacional;
}

// Cálculo RETROACTIVO de prestaciones sociales (Art. 142 literal b): 30 días
// de salario integral por cada año de servicio (con la fracción >6 meses
// redondeada hacia arriba). No compara contra la garantía trimestral
// acumulada (literal a) — ver advertencia al inicio del archivo.
export function prestacionesSocialesRetroactivo(params: {
  baseMensual: number;
  fechaIngreso: Date;
  fechaEgreso: Date;
  diasUtilidadesAnio: number;
  diasBonoVacacional: number;
}): { anios: number; salarioIntegralDiario: number; monto: number } {
  const anios = aniosServicioParaPrestaciones(params.fechaIngreso, params.fechaEgreso);
  const integral = salarioIntegralDiario(params.baseMensual, params.diasUtilidadesAnio, params.diasBonoVacacional);
  return { anios, salarioIntegralDiario: integral, monto: 30 * anios * integral };
}

// ── Vocabulario de estados ──────────────────────────────────────────────────

export const ESTADOS_VACACIONES = ["pendiente", "disfrutando", "disfrutada"] as const;
export const estadoVacacionesLabels: Record<string, string> = {
  pendiente: "Pendiente",
  disfrutando: "Disfrutando",
  disfrutada: "Disfrutada",
};
export const estadoVacacionesClass: Record<string, string> = {
  pendiente: "bg-slate-100 text-slate-600",
  disfrutando: "bg-amber-50 text-amber-700",
  disfrutada: "bg-emerald-50 text-emerald-700",
};

export const ESTADOS_UTILIDADES = ["pendiente", "pagado_parcial", "pagado"] as const;
export const estadoUtilidadesLabels: Record<string, string> = {
  pendiente: "Pendiente",
  pagado_parcial: "Pagado parcial",
  pagado: "Pagado",
};
export const estadoUtilidadesClass: Record<string, string> = {
  pendiente: "bg-slate-100 text-slate-600",
  pagado_parcial: "bg-amber-50 text-amber-700",
  pagado: "bg-emerald-50 text-emerald-700",
};

export const MOTIVOS_LIQUIDACION = ["renuncia", "despido_justificado", "despido_injustificado", "mutuo_acuerdo", "otro"] as const;
export const motivoLiquidacionLabels: Record<string, string> = {
  renuncia: "Renuncia",
  despido_justificado: "Despido justificado",
  despido_injustificado: "Despido injustificado",
  mutuo_acuerdo: "Mutuo acuerdo",
  otro: "Otro",
};

export const ESTADOS_LIQUIDACION = ["borrador", "pagada"] as const;
export const estadoLiquidacionLabels: Record<string, string> = {
  borrador: "Borrador",
  pagada: "Pagada",
};
export const estadoLiquidacionClass: Record<string, string> = {
  borrador: "bg-slate-100 text-slate-600",
  pagada: "bg-emerald-50 text-emerald-700",
};
