// Configuración de nómina — parte 2 (Etapa 2.4): vocabulario de beneficios,
// conceptos/bonos y aportes de ley. Módulo puro, sin Prisma ni Next.

export const TIPOS_DISTRIBUCION_UTILIDADES = ["pago_unico_diciembre", "otro"] as const;
export type TipoDistribucionUtilidades = (typeof TIPOS_DISTRIBUCION_UTILIDADES)[number];

export const tipoDistribucionUtilidadesLabels: Record<string, string> = {
  pago_unico_diciembre: "Pago único en diciembre",
  otro: "Otro",
};

// ── Conceptos y bonos — catálogo estándar (se siembra una vez por cliente) ──
export type ConceptoSemilla = { clave: string; nombre: string; moneda: string; formulaAyuda: string };

export const CONCEPTOS_ESTANDAR: ConceptoSemilla[] = [
  {
    clave: "hora_extra_diurna",
    nombre: "Hora extra diurna",
    moneda: "USD",
    formulaAyuda: "(sueldo/30/8)*horas*1.5",
  },
  {
    clave: "hora_extra_nocturna",
    nombre: "Hora extra nocturna",
    moneda: "USD",
    formulaAyuda: "(sueldo/30/8)*horas*1.8",
  },
  {
    clave: "bono_nocturno",
    nombre: "Bono nocturno",
    moneda: "USD",
    formulaAyuda: "(sueldo/30/8)*horas*0.3",
  },
  {
    clave: "feriado_trabajado",
    nombre: "Día feriado trabajado",
    moneda: "USD",
    formulaAyuda: "(sueldo/30)*dias*2",
  },
  {
    clave: "dia_adicional_trabajado",
    nombre: "Día adicional trabajado",
    moneda: "USD",
    formulaAyuda: "(sueldo/30)*dias",
  },
];

// ── Aportes de ley — catálogo estándar (Venezuela) ──────────────────────────
export type AporteSemilla = { clave: string; tipo: "trabajador" | "patronal"; nombre: string; porcentaje: number };

export const APORTES_ESTANDAR: AporteSemilla[] = [
  { clave: "ivss_trabajador", tipo: "trabajador", nombre: "IVSS", porcentaje: 4 },
  { clave: "rpe_trabajador", tipo: "trabajador", nombre: "Régimen Prestacional de Empleo (paro forzoso)", porcentaje: 0.5 },
  { clave: "faov_trabajador", tipo: "trabajador", nombre: "FAOV", porcentaje: 1 },
  { clave: "ivss_patronal", tipo: "patronal", nombre: "IVSS", porcentaje: 10 },
  { clave: "rpe_patronal", tipo: "patronal", nombre: "Régimen Prestacional de Empleo (paro forzoso)", porcentaje: 2 },
  { clave: "faov_patronal", tipo: "patronal", nombre: "FAOV", porcentaje: 2 },
  { clave: "inces_patronal", tipo: "patronal", nombre: "INCES", porcentaje: 2 },
];

export const TIPOS_APORTE = ["trabajador", "patronal"] as const;
export type TipoAporte = (typeof TIPOS_APORTE)[number];

export const tipoAporteLabels: Record<string, string> = {
  trabajador: "Aportes del trabajador",
  patronal: "Aportes patronales",
};

// ── Cuentas contables — plantilla estándar para "Autoasignar" ──────────────
export const PLANTILLA_CUENTAS_CONTABLES = {
  cuentaGastoSueldos: "6-1-01 Gasto de Sueldos y Salarios",
  cuentaNominaPorPagarVES: "2-1-05-01 Nómina por Pagar (Bs)",
  cuentaNominaPorPagarUSD: "2-1-05-02 Nómina por Pagar (USD)",
  cuentaDeduccionesPorPagar: "2-1-06 Deducciones por Pagar",
} as const;
