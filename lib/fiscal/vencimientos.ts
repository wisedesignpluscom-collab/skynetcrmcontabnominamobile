// Motor de vencimientos fiscales — Venezuela.
//
// Módulo PURO (sin Prisma, sin Next): recibe la obligación, el período y los
// datos del año (feriados y calendario del SENIAT) y devuelve la fecha límite.
// Se prueba solo, como lib/engine/evaluator.ts, y lo consume lib/fiscal/data.ts.
//
// Convenciones que hacen simple el resto del sistema:
//
//  · El **período fiscal se identifica por su mes de cierre**: "2026-07" es julio
//    (mensual), el trimestre que cierra en julio (trimestral) o el ejercicio que
//    cierra en julio (anual). Lo quincenal se escribe "2026-07-Q1" / "2026-07-Q2".
//  · La obligación **vence en el mes siguiente al de cierre**. Única excepción:
//    la primera quincena, que vence dentro de su propio mes (a partir del día 16).
//  · Todas las fechas se construyen a **mediodía local** (misma convención que
//    las tareas y la ficha del cliente) para que ningún cambio de zona horaria
//    corra el día al anterior.
//  · Si no hay datos para calcular (calendario del SENIAT sin cargar, RIF
//    inválido, regla manual), se devuelve `fecha: null` con el motivo. **Nunca
//    se inventa una fecha**: la fija el analista.

export type Jurisdiccion = "nacional" | "municipal";
export type Periodicidad = "mensual" | "quincenal" | "trimestral" | "anual";
export type ReglaTipo = "dias_habiles" | "dia_fijo" | "terminacion_rif" | "manual";

export const PERIODICIDADES: { key: Periodicidad; label: string; meses: number }[] = [
  { key: "quincenal", label: "Quincenal", meses: 0 },
  { key: "mensual", label: "Mensual", meses: 1 },
  { key: "trimestral", label: "Trimestral", meses: 3 },
  { key: "anual", label: "Anual", meses: 12 },
];

export const REGLAS_VENCIMIENTO: { key: ReglaTipo; label: string; hint: string; pideParam: boolean }[] = [
  {
    key: "dias_habiles",
    label: "Primeros N días hábiles",
    hint: "Cuenta días hábiles desde el inicio del mes de vencimiento, saltando fines de semana y feriados.",
    pideParam: true,
  },
  {
    key: "dia_fijo",
    label: "Día fijo del mes",
    hint: "Siempre el mismo día del mes de vencimiento. Si cae en día no hábil, pasa al siguiente hábil.",
    pideParam: true,
  },
  {
    key: "terminacion_rif",
    label: "Según terminación del RIF",
    hint: "Toma el día del calendario del SENIAT del año según el último dígito del RIF del cliente.",
    pideParam: false,
  },
  {
    key: "manual",
    label: "La fija el analista",
    hint: "El sistema no calcula la fecha; se carga a mano en cada caso.",
    pideParam: false,
  },
];

export const ENTES = ["SENIAT", "IVSS", "BANAVIH", "Alcaldía", "otro"] as const;

// ── Fechas ──────────────────────────────────────────────────────────────────

// Mediodía local del día indicado (mes 1-12).
export function fechaLocal(anio: number, mes: number, dia: number): Date {
  return new Date(anio, mes - 1, dia, 12, 0, 0, 0);
}

export function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

// Suma meses conservando el día, recortando al último día del mes destino:
// 31 de enero + 1 mes = 28/29 de febrero. El engine solo tenía addDays / "+30d",
// que no sirve para períodos fiscales porque los meses no duran 30 días.
export function addMonths(fecha: Date, meses: number): Date {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth() + 1 + meses;
  const anioDestino = anio + Math.floor((mes - 1) / 12);
  const mesDestino = ((((mes - 1) % 12) + 12) % 12) + 1;
  const dia = Math.min(fecha.getDate(), diasDelMes(anioDestino, mesDestino));
  return fechaLocal(anioDestino, mesDestino, dia);
}

// Clave "aaaa-mm-dd" en hora local — la usan los feriados y las comparaciones.
export function claveDia(fecha: Date): string {
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${m}-${d}`;
}

// ── Períodos fiscales ───────────────────────────────────────────────────────

export type Periodo = { anio: number; mes: number; quincena?: 1 | 2 };

const PERIODO_RE = /^(\d{4})-(\d{2})(?:-Q([12]))?$/;

export function parsePeriodo(texto: string | null | undefined): Periodo | null {
  if (!texto) return null;
  const m = PERIODO_RE.exec(texto.trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  const quincena = m[3] ? (Number(m[3]) as 1 | 2) : undefined;
  return quincena ? { anio, mes, quincena } : { anio, mes };
}

export function formatPeriodo(p: Periodo): string {
  const base = `${p.anio}-${String(p.mes).padStart(2, "0")}`;
  return p.quincena ? `${base}-Q${p.quincena}` : base;
}

// Etiqueta legible para la UI: "Julio 2026" / "Julio 2026 · 1ª quincena".
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function etiquetaPeriodo(texto: string): string {
  const p = parsePeriodo(texto);
  if (!p) return texto;
  const base = `${MESES[p.mes - 1]} ${p.anio}`;
  return p.quincena ? `${base} · ${p.quincena}ª quincena` : base;
}

// Período siguiente al dado. Es la base del auto-clonado del caso recurrente (F4).
export function periodoSiguiente(texto: string, periodicidad: Periodicidad): string | null {
  const p = parsePeriodo(texto);
  if (!p) return null;

  if (periodicidad === "quincenal") {
    const quincena = p.quincena ?? 1;
    if (quincena === 1) return formatPeriodo({ anio: p.anio, mes: p.mes, quincena: 2 });
    const sig = addMonths(fechaLocal(p.anio, p.mes, 1), 1);
    return formatPeriodo({ anio: sig.getFullYear(), mes: sig.getMonth() + 1, quincena: 1 });
  }

  const meses = PERIODICIDADES.find((x) => x.key === periodicidad)?.meses ?? 1;
  const sig = addMonths(fechaLocal(p.anio, p.mes, 1), meses);
  return formatPeriodo({ anio: sig.getFullYear(), mes: sig.getMonth() + 1 });
}

// El período vence en el mes siguiente al de cierre, salvo la primera quincena
// (vence dentro de su propio mes, contando desde el día 16).
function ventanaDeVencimiento(p: Periodo): { anio: number; mes: number; desdeDia: number } {
  if (p.quincena === 1) return { anio: p.anio, mes: p.mes, desdeDia: 16 };
  const sig = addMonths(fechaLocal(p.anio, p.mes, 1), 1);
  return { anio: sig.getFullYear(), mes: sig.getMonth() + 1, desdeDia: 1 };
}

// ── Días hábiles ────────────────────────────────────────────────────────────

// Feriados como claves "aaaa-mm-dd" (los produce lib/fiscal/data.ts desde DiaNoHabil).
export type Feriados = ReadonlySet<string> | readonly string[];

function esFeriado(fecha: Date, feriados: Feriados): boolean {
  const clave = claveDia(fecha);
  return feriados instanceof Set ? feriados.has(clave) : (feriados as readonly string[]).includes(clave);
}

export function esDiaHabil(fecha: Date, feriados: Feriados = []): boolean {
  const dia = fecha.getDay();
  if (dia === 0 || dia === 6) return false;
  return !esFeriado(fecha, feriados);
}

// Primer día hábil en la fecha dada o después de ella.
export function siguienteDiaHabil(fecha: Date, feriados: Feriados = []): Date {
  const d = new Date(fecha);
  let guarda = 0;
  while (!esDiaHabil(d, feriados)) {
    d.setDate(d.getDate() + 1);
    // Un año entero de días no hábiles seguidos es imposible: corta datos absurdos.
    if (++guarda > 366) return fecha;
  }
  return d;
}

// N-ésimo día hábil contando desde `desdeDia` del mes (N ≥ 1). Si el mes se
// acaba antes de llegar a N, sigue en el mes siguiente (caso raro, pero no
// devuelve una fecha inválida).
export function nDiaHabil(
  anio: number,
  mes: number,
  desdeDia: number,
  n: number,
  feriados: Feriados = []
): Date {
  const objetivo = Math.max(1, Math.trunc(n));
  const cursor = fechaLocal(anio, mes, desdeDia);
  let habiles = 0;
  let guarda = 0;
  for (;;) {
    if (esDiaHabil(cursor, feriados)) {
      habiles++;
      if (habiles === objetivo) return new Date(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
    if (++guarda > 366) return cursor;
  }
}

// ── Cálculo del vencimiento ─────────────────────────────────────────────────

export type ReglaObligacion = {
  periodicidad: Periodicidad | string;
  reglaTipo: ReglaTipo | string;
  reglaParam?: number | null;
};

// Fila del calendario del SENIAT del año (la carga lib/fiscal/data.ts).
export type EntradaCalendario = {
  periodicidad: string;
  digito: number;
  diaDelMes: number;
};

export type Vencimiento = {
  // null = no se pudo calcular; la fija el analista
  fecha: Date | null;
  regla: ReglaTipo;
  // Por qué quedó sin calcular (mensaje para el analista)
  motivo?: string;
};

export type EntradaCalculo = {
  obligacion: ReglaObligacion;
  periodo: string;
  // RIF del cliente — solo lo usa la regla «terminacion_rif»
  rif?: string | null;
  feriados?: Feriados;
  calendario?: readonly EntradaCalendario[];
};

// Último dígito del RIF sin depender de lib/rif (mantiene el módulo autónomo):
// se acepta el mismo formato canónico J-12345678-9.
function digitoDelRif(rif: string | null | undefined): number | null {
  if (!rif) return null;
  const m = /^([JVEGP])-?(\d{8})-?(\d)$/i.exec(rif.trim().replace(/\s+/g, ""));
  return m ? Number(m[3]) : null;
}

export function calcularVencimiento({
  obligacion,
  periodo,
  rif,
  feriados = [],
  calendario = [],
}: EntradaCalculo): Vencimiento {
  const regla = (obligacion.reglaTipo || "manual") as ReglaTipo;
  const p = parsePeriodo(periodo);
  if (!p) {
    return { fecha: null, regla, motivo: `Período fiscal inválido: «${periodo}».` };
  }

  const { anio, mes, desdeDia } = ventanaDeVencimiento(p);

  switch (regla) {
    case "dias_habiles": {
      const n = obligacion.reglaParam ?? 0;
      if (!n || n < 1) {
        return { fecha: null, regla, motivo: "La obligación no dice cuántos días hábiles." };
      }
      return { fecha: nDiaHabil(anio, mes, desdeDia, n, feriados), regla };
    }

    case "dia_fijo": {
      const n = obligacion.reglaParam ?? 0;
      if (!n || n < 1) {
        return { fecha: null, regla, motivo: "La obligación no dice qué día del mes vence." };
      }
      const dia = Math.min(n, diasDelMes(anio, mes));
      return { fecha: siguienteDiaHabil(fechaLocal(anio, mes, dia), feriados), regla };
    }

    case "terminacion_rif": {
      const digito = digitoDelRif(rif);
      if (digito === null) {
        return {
          fecha: null,
          regla,
          motivo: "El cliente no tiene un RIF válido: sin su último dígito no hay fecha en el calendario del SENIAT.",
        };
      }
      const periodicidad = (obligacion.periodicidad || "mensual") as string;
      const fila =
        calendario.find((c) => c.digito === digito && c.periodicidad === periodicidad) ??
        calendario.find((c) => c.digito === digito);
      if (!fila) {
        return {
          fecha: null,
          regla,
          motivo: `No está cargado el calendario del SENIAT de ${anio} para la terminación ${digito}.`,
        };
      }
      const dia = Math.min(Math.max(fila.diaDelMes, 1), diasDelMes(anio, mes));
      return { fecha: siguienteDiaHabil(fechaLocal(anio, mes, dia), feriados), regla };
    }

    default:
      return { fecha: null, regla: "manual", motivo: "Esta obligación se vence a criterio del analista." };
  }
}
