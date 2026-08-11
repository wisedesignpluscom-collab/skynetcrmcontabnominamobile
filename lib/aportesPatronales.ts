// Aportes de ley por ente (Etapa 3.7 «Mis Consultores»): a diferencia de
// recalcularDetalle (que solo aplica la pata `trabajador` para restar del
// neto), aquí se aplican TRABAJADOR y PATRONAL de cada AporteLegal activo,
// agrupados por ente (IVSS/BANAVIH/INCES/SENIAT), para generar la cuenta por
// pagar real de la firma — no solo lo que se le retiene al trabajador.
//
// Único aporte con tope: IVSS, 5 salarios mínimos (art. 59 LSS) — el resto
// (FAOV, INCES, Pensiones) no tiene tope, según el manual de procedimientos.
//
// Módulo puro, sin Prisma ni Next — mismo espíritu que lib/corridas.ts.

export type AporteLegalCalc = {
  // null = el aporte no tiene ente asignado todavía: se ignora aquí (no se
  // puede generar una cuenta por pagar sin saber a quién).
  ente: string | null;
  tipo: "trabajador" | "patronal";
  porcentaje: number;
  cuentaContable: string | null;
};

export type BaseAporteTrabajador = { baseParaAporte: number };

export type EnteTotal = {
  ente: string;
  montoTrabajador: number;
  montoPatronal: number;
  montoTotal: number;
  // La cuenta contable del primer AporteLegal del ente que la tenga definida
  cuentaContable: string | null;
};

const ENTE_CON_TOPE = "IVSS";
const TOPE_SALARIOS_MINIMOS = 5;

export function calcularAportesPeriodo(
  bases: BaseAporteTrabajador[],
  aportesLegales: AporteLegalCalc[],
  salarioMinimoVigente: number | null
): EnteTotal[] {
  const grupos = new Map<string, EnteTotal>();

  for (const aporte of aportesLegales) {
    if (!aporte.ente) continue;
    if (!grupos.has(aporte.ente)) {
      grupos.set(aporte.ente, { ente: aporte.ente, montoTrabajador: 0, montoPatronal: 0, montoTotal: 0, cuentaContable: null });
    }
    const grupo = grupos.get(aporte.ente)!;
    if (aporte.cuentaContable && !grupo.cuentaContable) grupo.cuentaContable = aporte.cuentaContable;

    const tope =
      aporte.ente === ENTE_CON_TOPE && salarioMinimoVigente != null
        ? salarioMinimoVigente * TOPE_SALARIOS_MINIMOS
        : null;

    for (const b of bases) {
      const base = tope != null ? Math.min(b.baseParaAporte, tope) : b.baseParaAporte;
      const monto = (base * aporte.porcentaje) / 100;
      if (aporte.tipo === "trabajador") grupo.montoTrabajador += monto;
      else grupo.montoPatronal += monto;
    }
  }

  for (const g of grupos.values()) g.montoTotal = g.montoTrabajador + g.montoPatronal;
  return [...grupos.values()].sort((a, b) => a.ente.localeCompare(b.ente));
}
