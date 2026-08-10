// Nómina y riesgo FAO — vocabulario, heurísticas y ciclo de vida de la
// declaración (módulo puro, sin Prisma ni Next).

export const ESTADOS_DECLARACION = ["pendiente", "en_revision", "aprobada"] as const;
export type EstadoDeclaracion = (typeof ESTADOS_DECLARACION)[number] | "bloqueada";

export const ESTADO_BLOQUEADA = "bloqueada";

export const estadoDeclaracionLabels: Record<string, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  bloqueada: "Bloqueada por riesgo",
};

export const estadoDeclaracionClass: Record<string, string> = {
  pendiente: "bg-slate-100 text-slate-600",
  en_revision: "bg-amber-50 text-amber-700",
  aprobada: "bg-emerald-50 text-emerald-700",
  bloqueada: "bg-red-50 text-red-700",
};

export function esEstadoDeclaracion(v: string | null | undefined): v is EstadoDeclaracion {
  return (
    !!v &&
    ((ESTADOS_DECLARACION as readonly string[]).includes(v) || v === ESTADO_BLOQUEADA)
  );
}

// Siguiente paso del flujo. «bloqueada» solo se resuelve (vuelve a en_revision
// vía resolverBloqueo, con nota de gerencia/supervisión) — nunca avanza directo
// a aprobada: bloquearse no es un paso más, es donde cae lo que se frenó por
// riesgo. La propia acción de avanzar decide si el intento de llegar a
// «aprobada» con riesgo activo se desvía a «bloqueada» en su lugar.
export function siguienteEstadoDeclaracion(estado: string): EstadoDeclaracion | null {
  if (estado === ESTADO_BLOQUEADA) return "en_revision";
  const i = (ESTADOS_DECLARACION as readonly string[]).indexOf(estado);
  if (i < 0 || i === ESTADOS_DECLARACION.length - 1) return null;
  return ESTADOS_DECLARACION[i + 1];
}

// Una declaración aprobada está lista para el archivo a Galac (Etapa 2).
export function declaracionCerrada(estado: string): boolean {
  return estado === "aprobada";
}

// ── Riesgo de subdeclaración del FAO ────────────────────────────────────────
// motivoRiesgo (columna multi-valor, ver lib/multivalor.ts) combina hasta tres
// motivos: dos automáticos (heurísticas) y uno manual (criterio del analista o
// del supervisor, para cuando detectan presión del cliente sin que ninguna
// heurística lo capture).

export const MOTIVOS_RIESGO = ["bajo_minimo", "caida_periodo", "manual"] as const;
export type MotivoRiesgo = (typeof MOTIVOS_RIESGO)[number];

export const motivoRiesgoLabels: Record<string, string> = {
  bajo_minimo: "Por debajo del salario mínimo vigente",
  caida_periodo: "Caída brusca respecto al período anterior",
  manual: "Marcado manualmente",
};

export function esMotivoRiesgo(v: string): v is MotivoRiesgo {
  return (MOTIVOS_RIESGO as readonly string[]).includes(v);
}

// Umbral configurable (AppSetting "nomina_riesgo_config" — el admin lo ajusta
// en /configuracion). Fracción 0-1: 0.2 = una caída de 20% o más es riesgo.
export type ConfigRiesgoNomina = { umbralCaidaPeriodo: number };

export const DEFAULT_CONFIG_RIESGO_NOMINA: ConfigRiesgoNomina = { umbralCaidaPeriodo: 0.2 };

export type SalarioMinimoEntry = { vigenteDesde: Date; monto: number };

// El vigente a una fecha: el de vigenciaDesde más reciente que no la supere.
// Sin datos cargados devuelve null — nunca se inventa un mínimo.
export function salarioMinimoVigente(
  historial: SalarioMinimoEntry[],
  fecha: Date
): SalarioMinimoEntry | null {
  let elegido: SalarioMinimoEntry | null = null;
  for (const s of historial) {
    if (s.vigenteDesde.getTime() > fecha.getTime()) continue;
    if (!elegido || s.vigenteDesde.getTime() > elegido.vigenteDesde.getTime()) elegido = s;
  }
  return elegido;
}

export type EvaluacionRiesgo = { riesgo: boolean; motivos: MotivoRiesgo[] };

// Heurísticas automáticas. Cada una solo se evalúa si tiene con qué comparar
// (salario mínimo cargado / período anterior existente) — sin dato de
// referencia no hay señal, nunca se asume riesgo por defecto.
export function evaluarRiesgoAutomatico(params: {
  baseDeclarada: number;
  salarioMinimo: SalarioMinimoEntry | null;
  baseAnterior: number | null;
  config?: ConfigRiesgoNomina;
}): EvaluacionRiesgo {
  const cfg = params.config ?? DEFAULT_CONFIG_RIESGO_NOMINA;
  const motivos: MotivoRiesgo[] = [];
  if (params.salarioMinimo && params.baseDeclarada < params.salarioMinimo.monto) {
    motivos.push("bajo_minimo");
  }
  if (
    params.baseAnterior != null &&
    params.baseAnterior > 0 &&
    params.baseDeclarada < params.baseAnterior * (1 - cfg.umbralCaidaPeriodo)
  ) {
    motivos.push("caida_periodo");
  }
  return { riesgo: motivos.length > 0, motivos };
}
