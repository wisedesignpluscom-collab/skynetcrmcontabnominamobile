// Demo completa del módulo de Nómina (Etapa 2, sub-etapas 2.1-2.7) — Mis
// Consultores.
//
// Llena VARIOS clientes ya existentes de la demo contable
// (prisma/seed-demo-contable.ts — correrlo antes si la base no tiene
// clientes) con varios trabajadores cada uno, probando los distintos casos
// del sistema: las tres frecuencias de pago, riesgo FAO en sus seis estados
// (normal, bajo mínimo, caída de período, marca manual, bloqueada, resuelta),
// corridas calculadas con auditoría (con y sin alerta), vacaciones /
// utilidades / liquidaciones en sus distintos estados, y geocercas.
//
// Los montos y fechas se calculan con el motor real (lib/nomina, lib/corridas,
// lib/lottt, lib/formulasNomina) igual que lo haría un analista desde la UI —
// no se inventan a mano — así la demo se comporta igual que producción.
//
//   npx tsx prisma/seed-demo-nomina.ts
//
// Reemplaza SOLO los datos de nómina (Trabajador y todo lo que cuelga de él,
// ConfiguracionNomina/Jornada/ConceptoNomina/AporteLegal/Geocerca/
// SalarioMinimo). No toca clientes, contactos, pipeline, casos ni facturación.

import { PrismaClient } from "@prisma/client";
import { fechaLocal, diasDelMes, formatPeriodo, parsePeriodo, addMonths } from "../lib/fiscal/vencimientos";
import { normalizeCedula } from "../lib/cedula";
import { serializeMulti } from "../lib/multivalor";
import { CONCEPTOS_ESTANDAR, APORTES_ESTANDAR, PLANTILLA_CUENTAS_CONTABLES } from "../lib/beneficiosNomina";
import { evaluarRiesgoAutomatico, salarioMinimoVigente, ESTADO_BLOQUEADA, type MotivoRiesgo } from "../lib/nomina";
import {
  rangoPeriodoNomina,
  mesDeclaracionDelPeriodo,
  baseProrrateada,
  auditarCorrida,
  periodoActualNomina,
  periodoAnteriorNomina,
} from "../lib/corridas";
import { evaluarFormulaConcepto } from "../lib/formulasNomina";
import type { FrecuenciaPago } from "../lib/jornadas";
import {
  aniosServicioCompletos,
  diasVacacionesLegal,
  diasBonoVacacionalLegal,
  mesesTrabajadosEnAnio,
  diasUtilidadesProporcional,
  salarioDiario,
  prestacionesSocialesRetroactivo,
} from "../lib/lottt";

const prisma = new PrismaClient();
const HOY = new Date();

function diasDesdeHoy(n: number): Date {
  const d = new Date(HOY);
  d.setDate(d.getDate() + n);
  return fechaLocal(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function fechaHaceAnios(anios: number): Date {
  const enteros = Math.floor(anios);
  const mesesFraccion = Math.round((anios - enteros) * 12);
  const d = new Date(HOY);
  d.setFullYear(d.getFullYear() - enteros);
  d.setMonth(d.getMonth() - mesesFraccion);
  return fechaLocal(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// "Hoy" menos N meses, como período mensual "YYYY-MM" (para DeclaracionNomina,
// que siempre es mensual sin importar la frecuencia de pago del cliente).
function mesAtras(n: number): string {
  const base = addMonths(fechaLocal(HOY.getFullYear(), HOY.getMonth() + 1, 1), -n);
  return formatPeriodo({ anio: base.getFullYear(), mes: base.getMonth() + 1 });
}

function esDuplicado(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

// Salario mínimo histórico (SOLO PARA LA DEMO): un aumento hace 5 meses.
// Todas las declaraciones "actuales" caen después de ese aumento, así que el
// umbral vigente para ellas es siempre 160 Bs.
const HISTORIAL_SALARIO_MINIMO = [
  { vigenteDesde: addMonths(fechaLocal(HOY.getFullYear(), HOY.getMonth() + 1, 1), -24), monto: 130 },
  { vigenteDesde: addMonths(fechaLocal(HOY.getFullYear(), HOY.getMonth() + 1, 1), -5), monto: 160 },
];

// ── Vocabulario del roster ───────────────────────────────────────────────────

type TipoContratoLiteral = "indefinido" | "determinado" | "obra_determinada";
type MotivoLiquidacionLiteral = "renuncia" | "despido_justificado" | "despido_injustificado" | "mutuo_acuerdo" | "otro";

type DeclaracionP0 = {
  base: number;
  estado: "pendiente" | "en_revision" | "aprobada" | "bloqueada";
  manualNota?: string;
  resuelta?: boolean;
};

type EmpleadoSeed = {
  cedula: string;
  nombre: string;
  cargo: string;
  tipoContrato: TipoContratoLiteral;
  antiguedad: number; // años (fracción admitida)
  nocturno?: boolean;
  overtime?: boolean;
  objetivoUsd?: number;
} & (
  | { activo: true; baseline: number; p0: DeclaracionP0 }
  | { activo: false; baseline: number; motivoBaja: string; motivoLiquidacion: MotivoLiquidacionLiteral; estadoLiquidacion: "borrador" | "pagada" }
);

type JornadaSeed = {
  nombre: string;
  horaEntrada: string;
  horaSalida: string;
  descansoMinutos: number;
  nocturna?: boolean;
  toleranciaMinutos?: number;
  umbralMedioDiaHoras?: number;
  diasOperacion: string;
};

type EmpresaSeed = {
  rif: string;
  frecuenciaPago: FrecuenciaPago;
  jornadas: JornadaSeed[];
  // true SOLO en el cliente que debe demostrar la alerta de auditoría: corre
  // también la corrida del período actual (con las bases ya bajadas), para
  // que el cruce contra la corrida anterior dispare auditoriaAlerta.
  correrPeriodoActual?: boolean;
  autoasignarCuentas: boolean;
  compensacionUsdActiva: boolean;
  compensacionUsdObjetivo?: number;
  parametrosPersonalizados: boolean;
  overridesLegales?: {
    salarioMinimoOverride?: number;
    bonoGuerraOverride?: number;
    cestaticketMensualOverride?: number;
    valorUTOverride?: number;
    jornadaSemanalHorasOverride?: number;
  };
  beneficios: {
    utilidadesDiasAnio: number;
    utilidadesDiasMin?: number;
    utilidadesDiasMax?: number;
    vacacionesDiasExtra: number;
    vacacionesColectivas?: boolean;
    cestaticketObjetivoUsd: number;
    anticiposPrestamosActivo?: boolean;
    anticiposPrestamosNotas?: string;
  };
  conceptoPropio?: { nombre: string; moneda: string; formulaAyuda: string };
  geocerca?: { nombre: string; latitud: number; longitud: number; radioMetros: number };
  empleados: EmpleadoSeed[];
};

const cedula = (empresaIdx: number, empleadoIdx: number) => `V-${20000000 + empresaIdx * 100000 + empleadoIdx}`;

const EMPRESAS: EmpresaSeed[] = [
  // ── Clínica Santa Lucía C.A. — grande, USD, quincenal ───────────────────────
  {
    rif: "J-31204567-8",
    frecuenciaPago: "quincenal",
    jornadas: [
      { nombre: "Turno día", horaEntrada: "07:00", horaSalida: "15:00", descansoMinutos: 30, diasOperacion: "L,M,X,J,V,S,D" },
      { nombre: "Turno noche", horaEntrada: "19:00", horaSalida: "07:00", descansoMinutos: 30, nocturna: true, diasOperacion: "L,M,X,J,V,S,D" },
    ],
    autoasignarCuentas: true,
    compensacionUsdActiva: true,
    compensacionUsdObjetivo: 500,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 60, utilidadesDiasMin: 30, utilidadesDiasMax: 120, vacacionesDiasExtra: 5, cestaticketObjetivoUsd: 60 },
    conceptoPropio: { nombre: "Bono de riesgo por turno nocturno", moneda: "USD", formulaAyuda: "(sueldo/30/8)*horas*0.4" },
    geocerca: { nombre: "Sede principal — Barquisimeto", latitud: 10.0678, longitud: -69.3474, radioMetros: 150 },
    empleados: [
      { cedula: cedula(0, 1), nombre: "María Fernanda Rojas", cargo: "Enfermera jefe", tipoContrato: "indefinido", antiguedad: 8, objetivoUsd: 600, activo: true, baseline: 950, p0: { base: 980, estado: "aprobada" } },
      { cedula: cedula(0, 2), nombre: "Carlos Eduardo Pérez", cargo: "Médico internista", tipoContrato: "indefinido", antiguedad: 5, overtime: true, activo: true, baseline: 1800, p0: { base: 1800, estado: "en_revision" } },
      { cedula: cedula(0, 3), nombre: "Yelitza Contreras", cargo: "Enfermera", tipoContrato: "determinado", antiguedad: 1.5, activo: true, baseline: 550, p0: { base: 560, estado: "pendiente" } },
      { cedula: cedula(0, 4), nombre: "Ronald Gutiérrez", cargo: "Camillero", tipoContrato: "indefinido", antiguedad: 0.4, activo: true, baseline: 320, p0: { base: 320, estado: "pendiente" } },
      {
        cedula: cedula(0, 5), nombre: "Digna Salazar", cargo: "Administradora", tipoContrato: "indefinido", antiguedad: 17, activo: true, baseline: 900,
        p0: { base: 920, estado: "en_revision", manualNota: "El cliente pidió no subir el sueldo declarado aunque ya se pactó un aumento verbal — queda marcado hasta confirmar por escrito." },
      },
      { cedula: cedula(0, 6), nombre: "Franklin Ojeda", cargo: "Personal de limpieza", tipoContrato: "indefinido", antiguedad: 3, activo: true, baseline: 400, p0: { base: 130, estado: "pendiente" } },
      { cedula: cedula(0, 7), nombre: "Nurbis Peña", cargo: "Recepcionista", tipoContrato: "determinado", antiguedad: 0.8, activo: true, baseline: 520, p0: { base: 300, estado: "en_revision" } },
      { cedula: cedula(0, 8), nombre: "Argenis Torrealba", cargo: "Vigilante nocturno", tipoContrato: "indefinido", antiguedad: 6, nocturno: true, activo: true, baseline: 400, p0: { base: 120, estado: "bloqueada" } },
      {
        cedula: cedula(0, 9), nombre: "Yolimar Herrera", cargo: "Bioanalista", tipoContrato: "obra_determinada", antiguedad: 2, activo: false, baseline: 600,
        motivoBaja: "Renuncia voluntaria para mudarse a otra ciudad", motivoLiquidacion: "renuncia", estadoLiquidacion: "pagada",
      },
      {
        cedula: cedula(0, 10), nombre: "Pedro Ramón Silva", cargo: "Farmacéutico interno", tipoContrato: "indefinido", antiguedad: 4.5, activo: false, baseline: 750,
        motivoBaja: "Despido justificado por inasistencias reiteradas", motivoLiquidacion: "despido_justificado", estadoLiquidacion: "borrador",
      },
    ],
  },
  // ── Distribuidora Alimentos del Centro C.A. — mediana, USD, quincenal ───────
  {
    rif: "J-30542187-6",
    frecuenciaPago: "quincenal",
    jornadas: [{ nombre: "Turno administrativo", horaEntrada: "08:00", horaSalida: "17:00", descansoMinutos: 60, diasOperacion: "L,M,X,J,V" }],
    correrPeriodoActual: true,
    autoasignarCuentas: true,
    compensacionUsdActiva: false,
    parametrosPersonalizados: true,
    overridesLegales: { salarioMinimoOverride: 165, bonoGuerraOverride: 60, cestaticketMensualOverride: 40, valorUTOverride: 9, jornadaSemanalHorasOverride: 44 },
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 40, anticiposPrestamosActivo: true, anticiposPrestamosNotas: "Tope de un mes de sueldo, descontado en 3 cuotas." },
    empleados: [
      { cedula: cedula(1, 1), nombre: "Norkys Álvarez", cargo: "Analista de compras", tipoContrato: "indefinido", antiguedad: 4, activo: true, baseline: 700, p0: { base: 710, estado: "aprobada" } },
      { cedula: cedula(1, 2), nombre: "Wladimir Peña", cargo: "Chofer de reparto", tipoContrato: "indefinido", antiguedad: 2, overtime: true, activo: true, baseline: 450, p0: { base: 260, estado: "en_revision" } },
      { cedula: cedula(1, 3), nombre: "Escarlet Manzano", cargo: "Auxiliar contable", tipoContrato: "determinado", antiguedad: 0.6, activo: true, baseline: 400, p0: { base: 230, estado: "pendiente" } },
      { cedula: cedula(1, 4), nombre: "Reinaldo Quero", cargo: "Almacenista", tipoContrato: "indefinido", antiguedad: 6, activo: true, baseline: 480, p0: { base: 480, estado: "en_revision" } },
      { cedula: cedula(1, 5), nombre: "Yajaira Cordero", cargo: "Vendedora de mostrador", tipoContrato: "indefinido", antiguedad: 1.2, activo: true, baseline: 380, p0: { base: 385, estado: "pendiente" } },
      {
        cedula: cedula(1, 6), nombre: "Simón Bastidas", cargo: "Ayudante de almacén", tipoContrato: "obra_determinada", antiguedad: 0.9, activo: false, baseline: 300,
        motivoBaja: "Terminó la obra/tarea para la que fue contratado", motivoLiquidacion: "otro", estadoLiquidacion: "pagada",
      },
    ],
  },
  // ── Transporte Carabobo Express C.A. — mediana, Bs, mensual ─────────────────
  {
    rif: "J-40118822-3",
    frecuenciaPago: "mensual",
    jornadas: [{ nombre: "Turno chofer", horaEntrada: "05:00", horaSalida: "14:00", descansoMinutos: 45, toleranciaMinutos: 15, diasOperacion: "L,M,X,J,V,S" }],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 0 },
    empleados: [
      { cedula: cedula(2, 1), nombre: "Wilmer Sequera", cargo: "Chofer senior", tipoContrato: "indefinido", antiguedad: 9, activo: true, baseline: 650, p0: { base: 660, estado: "aprobada" } },
      {
        cedula: cedula(2, 2), nombre: "Yorman Delgado", cargo: "Chofer", tipoContrato: "indefinido", antiguedad: 3, activo: true, baseline: 400,
        p0: { base: 250, estado: "en_revision", resuelta: true },
      },
      { cedula: cedula(2, 3), nombre: "Katherine Bravo", cargo: "Despachadora", tipoContrato: "determinado", antiguedad: 1, activo: true, baseline: 300, p0: { base: 305, estado: "pendiente" } },
      { cedula: cedula(2, 4), nombre: "Ángel Rodríguez", cargo: "Mecánico", tipoContrato: "indefinido", antiguedad: 5, activo: true, baseline: 420, p0: { base: 140, estado: "en_revision" } },
      {
        cedula: cedula(2, 5), nombre: "Deivis Colmenárez", cargo: "Ayudante de chofer", tipoContrato: "indefinido", antiguedad: 2, activo: false, baseline: 280,
        motivoBaja: "Despido injustificado por reducción de personal", motivoLiquidacion: "despido_injustificado", estadoLiquidacion: "borrador",
      },
    ],
  },
  // ── Ferretería Los Andes C.A. — pequeña, USD, semanal ───────────────────────
  {
    rif: "J-29876543-1",
    frecuenciaPago: "semanal",
    jornadas: [{ nombre: "Turno tienda", horaEntrada: "08:00", horaSalida: "18:00", descansoMinutos: 60, umbralMedioDiaHoras: 4, diasOperacion: "L,M,X,J,V,S" }],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, vacacionesColectivas: true, cestaticketObjetivoUsd: 25 },
    geocerca: { nombre: "Local — Av. Los Leones", latitud: 10.073, longitud: -69.335, radioMetros: 80 },
    empleados: [
      { cedula: cedula(3, 1), nombre: "Neomar Pérez", cargo: "Vendedor de mostrador", tipoContrato: "indefinido", antiguedad: 2.5, activo: true, baseline: 350, p0: { base: 355, estado: "en_revision" } },
      { cedula: cedula(3, 2), nombre: "Josmar Linares", cargo: "Cajera", tipoContrato: "determinado", antiguedad: 0.3, activo: true, baseline: 260, p0: { base: 260, estado: "pendiente" } },
      {
        cedula: cedula(3, 3), nombre: "Argenis Camacho", cargo: "Bodeguero", tipoContrato: "indefinido", antiguedad: 5, activo: true, baseline: 500,
        p0: { base: 510, estado: "en_revision", manualNota: "La propietaria comentó que está pidiendo que le paguen una parte aparte en efectivo — queda marcado mientras se conversa." },
      },
      { cedula: cedula(3, 4), nombre: "Zuleima Petit", cargo: "Administradora", tipoContrato: "indefinido", antiguedad: 7, activo: true, baseline: 700, p0: { base: 715, estado: "aprobada" } },
      {
        cedula: cedula(3, 5), nombre: "Yoel Peraza", cargo: "Ayudante de tienda", tipoContrato: "indefinido", antiguedad: 1.5, activo: false, baseline: 300,
        motivoBaja: "Retiro de mutuo acuerdo por cierre de la sucursal", motivoLiquidacion: "mutuo_acuerdo", estadoLiquidacion: "pagada",
      },
    ],
  },
  // ── Farmacia Vida Plena C.A. — micro, USD, quincenal ────────────────────────
  {
    rif: "J-40667788-2",
    frecuenciaPago: "quincenal",
    jornadas: [{ nombre: "Turno farmacia", horaEntrada: "08:00", horaSalida: "19:00", descansoMinutos: 60, diasOperacion: "L,M,X,J,V,S,D" }],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 20 },
    empleados: [
      { cedula: cedula(4, 1), nombre: "Marielba Torres", cargo: "Regente farmacéutica", tipoContrato: "indefinido", antiguedad: 4, activo: true, baseline: 750, p0: { base: 760, estado: "aprobada" } },
      { cedula: cedula(4, 2), nombre: "Dixon Álvarez", cargo: "Auxiliar de farmacia", tipoContrato: "determinado", antiguedad: 0.9, activo: true, baseline: 300, p0: { base: 145, estado: "pendiente" } },
    ],
  },
  // ── Agropecuaria El Tocuyo S.A. — mediana, USD, mensual ─────────────────────
  {
    rif: "J-31556677-4",
    frecuenciaPago: "mensual",
    jornadas: [{ nombre: "Turno de campo", horaEntrada: "06:00", horaSalida: "14:00", descansoMinutos: 60, diasOperacion: "L,M,X,J,V,S" }],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 20 },
    empleados: [
      { cedula: cedula(5, 1), nombre: "Argenis Yépez", cargo: "Capataz", tipoContrato: "indefinido", antiguedad: 7, activo: true, baseline: 500, p0: { base: 500, estado: "aprobada" } },
      { cedula: cedula(5, 2), nombre: "Maura Linares", cargo: "Administradora de finca", tipoContrato: "indefinido", antiguedad: 4, activo: true, baseline: 480, p0: { base: 485, estado: "en_revision" } },
      { cedula: cedula(5, 3), nombre: "Pablo Rengel", cargo: "Obrero agrícola", tipoContrato: "obra_determinada", antiguedad: 1.2, activo: true, baseline: 280, p0: { base: 280, estado: "pendiente" } },
      { cedula: cedula(5, 4), nombre: "Deisy Cordero", cargo: "Obrera agrícola", tipoContrato: "obra_determinada", antiguedad: 0.5, activo: true, baseline: 260, p0: { base: 260, estado: "pendiente" } },
      { cedula: cedula(5, 5), nombre: "Rómulo Sequera", cargo: "Tractorista", tipoContrato: "indefinido", antiguedad: 5, activo: true, baseline: 350, p0: { base: 150, estado: "en_revision" } },
      {
        cedula: cedula(5, 6), nombre: "Freddy Vásquez", cargo: "Obrero agrícola", tipoContrato: "obra_determinada", antiguedad: 1, activo: false, baseline: 260,
        motivoBaja: "Terminó la temporada de cosecha", motivoLiquidacion: "otro", estadoLiquidacion: "pagada",
      },
    ],
  },
  // ── Automotriz del Centro C.A. — mediana, USD, quincenal (prospecto) ────────
  {
    rif: "J-30778899-3",
    frecuenciaPago: "quincenal",
    jornadas: [{ nombre: "Turno taller", horaEntrada: "08:00", horaSalida: "17:00", descansoMinutos: 60, diasOperacion: "L,M,X,J,V,S" }],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 25 },
    empleados: [
      { cedula: cedula(6, 1), nombre: "Reinaldo Bastardo", cargo: "Jefe de taller", tipoContrato: "indefinido", antiguedad: 6, activo: true, baseline: 550, p0: { base: 555, estado: "aprobada" } },
      { cedula: cedula(6, 2), nombre: "Yeimy Salcedo", cargo: "Asesora de servicio", tipoContrato: "determinado", antiguedad: 1, activo: true, baseline: 350, p0: { base: 350, estado: "pendiente" } },
      { cedula: cedula(6, 3), nombre: "Carlos Requena", cargo: "Mecánico", tipoContrato: "indefinido", antiguedad: 3, activo: true, baseline: 400, p0: { base: 220, estado: "en_revision" } },
      { cedula: cedula(6, 4), nombre: "Luis Paredes", cargo: "Ayudante de taller", tipoContrato: "obra_determinada", antiguedad: 0.4, activo: true, baseline: 260, p0: { base: 260, estado: "pendiente" } },
    ],
  },
  // ── Comercializadora Simón Planas C.A. — pequeña, USD, quincenal (perdido) ──
  {
    rif: "J-42998877-4",
    frecuenciaPago: "quincenal",
    jornadas: [{ nombre: "Turno tienda", horaEntrada: "08:00", horaSalida: "17:00", descansoMinutos: 60, diasOperacion: "L,M,X,J,V,S" }],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 15 },
    empleados: [
      { cedula: cedula(7, 1), nombre: "Nereida Pacheco", cargo: "Encargada de tienda", tipoContrato: "indefinido", antiguedad: 3, activo: true, baseline: 350, p0: { base: 355, estado: "aprobada" } },
      { cedula: cedula(7, 2), nombre: "Jhonny Álvarez", cargo: "Vendedor", tipoContrato: "determinado", antiguedad: 0.8, activo: true, baseline: 280, p0: { base: 280, estado: "pendiente" } },
      {
        cedula: cedula(7, 3), nombre: "Marbelys Rondón", cargo: "Cajera", tipoContrato: "indefinido", antiguedad: 1.5, activo: false, baseline: 260,
        motivoBaja: "Renuncia — el cliente cerró la relación con la firma antes de completar el traspaso", motivoLiquidacion: "renuncia", estadoLiquidacion: "borrador",
      },
    ],
  },
  // ── Constructora Lara 2000 C.A. — grande, USD, semanal ──────────────────────
  {
    rif: "J-29334455-9",
    frecuenciaPago: "semanal",
    jornadas: [{ nombre: "Turno obra", horaEntrada: "07:00", horaSalida: "16:00", descansoMinutos: 60, diasOperacion: "L,M,X,J,V,S" }],
    autoasignarCuentas: true,
    compensacionUsdActiva: false,
    parametrosPersonalizados: true,
    overridesLegales: { salarioMinimoOverride: 165, bonoGuerraOverride: 60, jornadaSemanalHorasOverride: 44 },
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 30 },
    empleados: [
      { cedula: cedula(8, 1), nombre: "Ing. Moisés Terán", cargo: "Residente de obra", tipoContrato: "indefinido", antiguedad: 9, activo: true, baseline: 1200, p0: { base: 1210, estado: "aprobada" } },
      { cedula: cedula(8, 2), nombre: "Yorbelis Fernández", cargo: "Administradora de obra", tipoContrato: "indefinido", antiguedad: 4, activo: true, baseline: 600, p0: { base: 605, estado: "en_revision" } },
      {
        cedula: cedula(8, 3), nombre: "Wilmer Ochoa", cargo: "Maestro de obra", tipoContrato: "obra_determinada", antiguedad: 2, activo: true, baseline: 500,
        p0: { base: 510, estado: "en_revision", manualNota: "El maestro de obra pidió que le declaren un monto menor para no perder un subsidio — queda marcado hasta conversarlo." },
      },
      { cedula: cedula(8, 4), nombre: "Ronny Guerra", cargo: "Albañil", tipoContrato: "obra_determinada", antiguedad: 1, activo: true, baseline: 350, p0: { base: 350, estado: "pendiente" } },
      { cedula: cedula(8, 5), nombre: "Eudimar Silva", cargo: "Albañil", tipoContrato: "obra_determinada", antiguedad: 0.6, activo: true, baseline: 340, p0: { base: 340, estado: "pendiente" } },
      { cedula: cedula(8, 6), nombre: "Jesús Blanco", cargo: "Ayudante de albañilería", tipoContrato: "obra_determinada", antiguedad: 0.3, activo: true, baseline: 280, p0: { base: 280, estado: "pendiente" } },
      { cedula: cedula(8, 7), nombre: "Carlos Peraza", cargo: "Electricista", tipoContrato: "indefinido", antiguedad: 6, activo: true, baseline: 450, p0: { base: 150, estado: "pendiente" } },
      {
        cedula: cedula(8, 8), nombre: "Ángel Marín", cargo: "Albañil", tipoContrato: "obra_determinada", antiguedad: 0.8, activo: false, baseline: 340,
        motivoBaja: "Terminó la etapa de la obra en la que trabajaba", motivoLiquidacion: "otro", estadoLiquidacion: "pagada",
      },
    ],
  },
  // ── Cooperativa Construmant, RL — pequeña, Bs, mensual ──────────────────────
  {
    rif: "J-31417163-8",
    frecuenciaPago: "mensual",
    jornadas: [{ nombre: "Turno cooperativa", horaEntrada: "07:00", horaSalida: "15:00", descansoMinutos: 45, diasOperacion: "L,M,X,J,V" }],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 0 },
    empleados: [
      { cedula: cedula(9, 1), nombre: "Nixon Aray", cargo: "Coordinador", tipoContrato: "indefinido", antiguedad: 5, activo: true, baseline: 400, p0: { base: 405, estado: "aprobada" } },
      { cedula: cedula(9, 2), nombre: "Marielys Torrealba", cargo: "Administradora", tipoContrato: "determinado", antiguedad: 2, activo: true, baseline: 350, p0: { base: 350, estado: "en_revision" } },
      { cedula: cedula(9, 3), nombre: "Génesis Rivas", cargo: "Auxiliar", tipoContrato: "obra_determinada", antiguedad: 0.6, activo: true, baseline: 260, p0: { base: 260, estado: "pendiente" } },
      { cedula: cedula(9, 4), nombre: "Freddy Linares", cargo: "Operario", tipoContrato: "indefinido", antiguedad: 3, activo: true, baseline: 300, p0: { base: 130, estado: "en_revision" } },
    ],
  },
  // ── Inversiones Río Claro C.A. — pequeña, USD, mensual (plan pausado) ───────
  {
    rif: "J-41223344-5",
    frecuenciaPago: "mensual",
    jornadas: [{ nombre: "Turno oficina", horaEntrada: "08:00", horaSalida: "16:00", descansoMinutos: 60, diasOperacion: "L,M,X,J,V" }],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 20 },
    empleados: [
      { cedula: cedula(10, 1), nombre: "Ottoniel Fajardo", cargo: "Analista financiero", tipoContrato: "indefinido", antiguedad: 3, activo: true, baseline: 500, p0: { base: 505, estado: "aprobada" } },
      { cedula: cedula(10, 2), nombre: "Yosmar Delgado", cargo: "Asistente administrativa", tipoContrato: "determinado", antiguedad: 1, activo: true, baseline: 320, p0: { base: 320, estado: "pendiente" } },
      { cedula: cedula(10, 3), nombre: "Eliecer Torres", cargo: "Mensajero", tipoContrato: "obra_determinada", antiguedad: 0.4, activo: true, baseline: 240, p0: { base: 240, estado: "pendiente" } },
    ],
  },
  // ── Panadería Trigo de Oro C.A. — micro, USD, semanal (prospecto) ───────────
  {
    rif: "J-42556677-1",
    frecuenciaPago: "semanal",
    jornadas: [
      { nombre: "Turno madrugada", horaEntrada: "04:00", horaSalida: "12:00", descansoMinutos: 30, diasOperacion: "L,M,X,J,V,S,D" },
      { nombre: "Turno mostrador", horaEntrada: "08:00", horaSalida: "17:00", descansoMinutos: 60, diasOperacion: "L,M,X,J,V,S,D" },
    ],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, vacacionesColectivas: true, cestaticketObjetivoUsd: 15 },
    empleados: [
      { cedula: cedula(11, 1), nombre: "Maribel Sánchez", cargo: "Maestra panadera", tipoContrato: "indefinido", antiguedad: 5, activo: true, baseline: 450, p0: { base: 455, estado: "aprobada" } },
      { cedula: cedula(11, 2), nombre: "Jhonatan Rivas", cargo: "Panadero", tipoContrato: "indefinido", antiguedad: 2, activo: true, baseline: 350, p0: { base: 350, estado: "en_revision" } },
      { cedula: cedula(11, 3), nombre: "Yusneidy Colmenares", cargo: "Panadera", tipoContrato: "determinado", antiguedad: 0.7, activo: true, baseline: 300, p0: { base: 300, estado: "pendiente" } },
      { cedula: cedula(11, 4), nombre: "Nelson Ibarra", cargo: "Panadero", tipoContrato: "obra_determinada", antiguedad: 0.3, activo: true, baseline: 280, p0: { base: 280, estado: "pendiente" } },
      { cedula: cedula(11, 5), nombre: "Carla Medina", cargo: "Cajera", tipoContrato: "determinado", antiguedad: 1, activo: true, baseline: 260, p0: { base: 130, estado: "pendiente" } },
      {
        cedula: cedula(11, 6), nombre: "Wuilmer Torres", cargo: "Repartidor", tipoContrato: "indefinido", antiguedad: 2, activo: true, baseline: 300,
        p0: { base: 305, estado: "en_revision", manualNota: "Pidió que le declaren menos para no perder una ayuda social — queda marcado mientras se conversa." },
      },
      { cedula: cedula(11, 7), nombre: "Rosmely Guédez", cargo: "Ayudante de panadería", tipoContrato: "obra_determinada", antiguedad: 0.5, activo: true, baseline: 260, p0: { base: 260, estado: "pendiente" } },
      {
        cedula: cedula(11, 8), nombre: "Anyelina Pérez", cargo: "Cajera", tipoContrato: "determinado", antiguedad: 0.9, activo: false, baseline: 260,
        motivoBaja: "Renuncia por mudanza a otra ciudad", motivoLiquidacion: "renuncia", estadoLiquidacion: "pagada",
      },
    ],
  },
  // ── Servicios Industriales Yaracuy C.A. — pequeña, USD, quincenal (lead) ────
  {
    rif: "J-31889900-6",
    frecuenciaPago: "quincenal",
    jornadas: [{ nombre: "Turno planta", horaEntrada: "07:00", horaSalida: "16:00", descansoMinutos: 60, diasOperacion: "L,M,X,J,V" }],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 15 },
    empleados: [
      { cedula: cedula(12, 1), nombre: "Deivis Marcano", cargo: "Encargado de planta", tipoContrato: "indefinido", antiguedad: 4, activo: true, baseline: 420, p0: { base: 425, estado: "aprobada" } },
      { cedula: cedula(12, 2), nombre: "Yeraldin Sulbarán", cargo: "Auxiliar administrativa", tipoContrato: "determinado", antiguedad: 0.6, activo: true, baseline: 280, p0: { base: 280, estado: "pendiente" } },
    ],
  },
  // ── Supermercados La Colina C.A. — grande, USD, quincenal (tres sucursales) ─
  {
    rif: "J-30991244-0",
    frecuenciaPago: "quincenal",
    jornadas: [{ nombre: "Turno tienda", horaEntrada: "07:00", horaSalida: "21:00", descansoMinutos: 60, diasOperacion: "L,M,X,J,V,S,D" }],
    autoasignarCuentas: true,
    compensacionUsdActiva: true,
    compensacionUsdObjetivo: 400,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 45, utilidadesDiasMin: 30, utilidadesDiasMax: 120, vacacionesDiasExtra: 3, cestaticketObjetivoUsd: 35 },
    empleados: [
      { cedula: cedula(13, 1), nombre: "Yusbelys Delgado", cargo: "Gerente de tienda", tipoContrato: "indefinido", antiguedad: 8, activo: true, baseline: 900, p0: { base: 910, estado: "aprobada" } },
      { cedula: cedula(13, 2), nombre: "Franyi Rondón", cargo: "Supervisora de caja", tipoContrato: "indefinido", antiguedad: 4, activo: true, baseline: 500, p0: { base: 505, estado: "en_revision" } },
      { cedula: cedula(13, 3), nombre: "Robert Sánchez", cargo: "Cajero", tipoContrato: "determinado", antiguedad: 1, activo: true, baseline: 320, p0: { base: 320, estado: "pendiente" } },
      { cedula: cedula(13, 4), nombre: "Milagros Peña", cargo: "Cajera", tipoContrato: "determinado", antiguedad: 0.6, activo: true, baseline: 300, p0: { base: 300, estado: "pendiente" } },
      { cedula: cedula(13, 5), nombre: "Ezequiel Blanco", cargo: "Reponedor", tipoContrato: "obra_determinada", antiguedad: 0.4, activo: true, baseline: 280, p0: { base: 280, estado: "pendiente" } },
      { cedula: cedula(13, 6), nombre: "Ana Karina Ruiz", cargo: "Reponedora", tipoContrato: "indefinido", antiguedad: 2, activo: true, baseline: 320, p0: { base: 130, estado: "en_revision" } },
      { cedula: cedula(13, 7), nombre: "Denny Rodríguez", cargo: "Carnicero", tipoContrato: "indefinido", antiguedad: 5, activo: true, baseline: 450, p0: { base: 260, estado: "en_revision" } },
      {
        cedula: cedula(13, 8), nombre: "Yerlin Torrealba", cargo: "Seguridad", tipoContrato: "indefinido", antiguedad: 3, activo: true, baseline: 380,
        p0: { base: 385, estado: "en_revision", manualNota: "El supervisor reportó una queja del cliente sobre este empleado — se marca mientras se investiga, aunque el monto declarado es normal." },
      },
      {
        cedula: cedula(13, 9), nombre: "Josnel Fernández", cargo: "Reponedor", tipoContrato: "obra_determinada", antiguedad: 0.7, activo: false, baseline: 300,
        motivoBaja: "Despido justificado por faltante de caja", motivoLiquidacion: "despido_justificado", estadoLiquidacion: "borrador",
      },
    ],
  },
  // ── Textiles Mérida C.A. — pequeña, USD, quincenal ──────────────────────────
  {
    rif: "J-28445901-7",
    frecuenciaPago: "quincenal",
    jornadas: [{ nombre: "Turno planta textil", horaEntrada: "07:00", horaSalida: "15:00", descansoMinutos: 45, diasOperacion: "L,M,X,J,V" }],
    autoasignarCuentas: false,
    compensacionUsdActiva: false,
    parametrosPersonalizados: false,
    beneficios: { utilidadesDiasAnio: 30, vacacionesDiasExtra: 0, cestaticketObjetivoUsd: 20 },
    empleados: [
      { cedula: cedula(14, 1), nombre: "Yolanda Manrique", cargo: "Jefa de producción", tipoContrato: "indefinido", antiguedad: 6, activo: true, baseline: 500, p0: { base: 505, estado: "aprobada" } },
      { cedula: cedula(14, 2), nombre: "Deivy Fernández", cargo: "Operario de máquina", tipoContrato: "indefinido", antiguedad: 2, activo: true, baseline: 350, p0: { base: 350, estado: "en_revision" } },
      { cedula: cedula(14, 3), nombre: "Marielis Godoy", cargo: "Costurera", tipoContrato: "determinado", antiguedad: 0.8, activo: true, baseline: 300, p0: { base: 300, estado: "pendiente" } },
      { cedula: cedula(14, 4), nombre: "Alexis Herrera", cargo: "Ayudante", tipoContrato: "obra_determinada", antiguedad: 0.4, activo: true, baseline: 260, p0: { base: 130, estado: "pendiente" } },
    ],
  },
];

async function main() {
  console.log("Limpiando la demo anterior del módulo de Nómina…");
  await prisma.liquidacion.deleteMany();
  await prisma.registroUtilidades.deleteMany();
  await prisma.registroVacaciones.deleteMany();
  await prisma.corridaLinea.deleteMany();
  await prisma.corridaDetalle.deleteMany();
  await prisma.corridaNomina.deleteMany();
  await prisma.asistenciaDia.deleteMany();
  await prisma.declaracionNomina.deleteMany();
  await prisma.trabajadorDocumento.deleteMany();
  await prisma.trabajador.deleteMany();
  await prisma.geocerca.deleteMany();
  await prisma.jornada.deleteMany();
  await prisma.conceptoNomina.deleteMany();
  await prisma.aporteLegal.deleteMany();
  await prisma.configuracionNomina.deleteMany();
  await prisma.salarioMinimo.deleteMany();

  console.log("Cargando el salario mínimo histórico (SOLO PARA LA DEMO)…");
  for (const s of HISTORIAL_SALARIO_MINIMO) {
    await prisma.salarioMinimo.create({ data: { vigenteDesde: s.vigenteDesde, monto: s.monto, moneda: "Bs" } });
  }

  const usuarios = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const admin = usuarios.find((u) => u.role === "admin") ?? usuarios[0];
  const supervisorPorDefecto = usuarios.find((u) => u.role === "supervisor") ?? admin;

  const p0Periodo = mesAtras(0);
  const p0Parsed = parsePeriodo(p0Periodo)!;
  const fechaRefMinimo = fechaLocal(p0Parsed.anio, p0Parsed.mes, 1);
  const minimoVigente = salarioMinimoVigente(HISTORIAL_SALARIO_MINIMO, fechaRefMinimo);

  let totalTrabajadores = 0;
  let totalCorridas = 0;

  for (const empresa of EMPRESAS) {
    const company = await prisma.company.findUnique({ where: { rif: empresa.rif } });
    if (!company) {
      console.warn(`⚠ No se encontró el cliente con RIF ${empresa.rif} — ¿corriste antes prisma/seed-demo-contable.ts?`);
      continue;
    }
    console.log(`\n── ${company.name} ──────────────────────────────`);
    const analistaId = company.analistaId ?? admin.id;
    const supervisorId = company.supervisorId ?? supervisorPorDefecto.id;

    // ── Configuración de nómina (2.3-2.4) ─────────────────────────────────────
    const monedaSalario = company.moneda ?? "USD";
    await prisma.configuracionNomina.create({
      data: {
        companyId: company.id,
        pais: "Venezuela",
        frecuenciaPago: empresa.frecuenciaPago,
        monedaSalario,
        monedaBonos: monedaSalario,
        monedaDeducciones: monedaSalario,
        ...(empresa.autoasignarCuentas ? PLANTILLA_CUENTAS_CONTABLES : {}),
        compensacionUsdActiva: empresa.compensacionUsdActiva,
        compensacionUsdObjetivo: empresa.compensacionUsdObjetivo ?? null,
        utilidadesDiasAnio: empresa.beneficios.utilidadesDiasAnio,
        utilidadesDiasMin: empresa.beneficios.utilidadesDiasMin ?? null,
        utilidadesDiasMax: empresa.beneficios.utilidadesDiasMax ?? null,
        vacacionesDiasExtra: empresa.beneficios.vacacionesDiasExtra,
        vacacionesColectivas: empresa.beneficios.vacacionesColectivas ?? false,
        cestaticketObjetivoUsd: empresa.beneficios.cestaticketObjetivoUsd,
        anticiposPrestamosActivo: empresa.beneficios.anticiposPrestamosActivo ?? false,
        anticiposPrestamosNotas: empresa.beneficios.anticiposPrestamosNotas ?? null,
        parametrosPersonalizados: empresa.parametrosPersonalizados,
        salarioMinimoOverride: empresa.overridesLegales?.salarioMinimoOverride ?? null,
        bonoGuerraOverride: empresa.overridesLegales?.bonoGuerraOverride ?? null,
        cestaticketMensualOverride: empresa.overridesLegales?.cestaticketMensualOverride ?? null,
        valorUTOverride: empresa.overridesLegales?.valorUTOverride ?? null,
        jornadaSemanalHorasOverride: empresa.overridesLegales?.jornadaSemanalHorasOverride ?? null,
      },
    });

    const jornadasCreadas = new Map<string, string>(); // nombre → id
    for (const j of empresa.jornadas) {
      const creada = await prisma.jornada.create({
        data: {
          companyId: company.id,
          nombre: j.nombre,
          horaEntrada: j.horaEntrada,
          horaSalida: j.horaSalida,
          descansoMinutos: j.descansoMinutos,
          nocturna: j.nocturna ?? false,
          toleranciaMinutos: j.toleranciaMinutos ?? null,
          umbralMedioDiaHoras: j.umbralMedioDiaHoras ?? null,
          diasOperacion: j.diasOperacion,
        },
      });
      jornadasCreadas.set(j.nombre, creada.id);
    }
    const jornadaDiurnaId = [...jornadasCreadas.values()][0];

    // Catálogo estándar de conceptos y aportes (mismo bootstrap que la UI real)
    await Promise.all([
      ...CONCEPTOS_ESTANDAR.map((c) =>
        prisma.conceptoNomina.create({ data: { companyId: company.id, isSystem: true, ...c } }).catch((e) => {
          if (!esDuplicado(e)) throw e;
        })
      ),
      ...APORTES_ESTANDAR.map((a) =>
        prisma.aporteLegal.create({ data: { companyId: company.id, isSystem: true, ...a } }).catch((e) => {
          if (!esDuplicado(e)) throw e;
        })
      ),
    ]);
    if (empresa.conceptoPropio) {
      await prisma.conceptoNomina.create({ data: { companyId: company.id, isSystem: false, ...empresa.conceptoPropio } });
    }

    if (empresa.geocerca) {
      await prisma.geocerca.create({ data: { companyId: company.id, ...empresa.geocerca, jornadaId: jornadaDiurnaId } });
    }

    // ── Trabajadores ───────────────────────────────────────────────────────────
    const activos: { id: string; nocturno?: boolean; overtime?: boolean }[] = [];
    for (const [empleadoIdx, emp] of empresa.empleados.entries()) {
      const fechaIngreso = fechaHaceAnios(emp.antiguedad);
      const trabajador = await prisma.trabajador.create({
        data: {
          companyId: company.id,
          cedula: normalizeCedula(emp.cedula)!,
          nombre: emp.nombre,
          cargo: emp.cargo,
          tipoContrato: emp.tipoContrato,
          fechaIngreso,
          fechaEgreso: emp.activo ? null : diasDesdeHoy(-25),
          activo: emp.activo,
          motivoBaja: emp.activo ? null : emp.motivoBaja,
          objetivoUsd: emp.objetivoUsd ?? null,
        },
      });
      totalTrabajadores++;
      await prisma.activity.create({
        data: { type: "sistema", content: "Alta del empleado en el roster", trabajadorId: trabajador.id },
      });
      await prisma.trabajadorDocumento.create({
        data: { trabajadorId: trabajador.id, nombre: "Cédula de identidad (escaneada)", url: `https://documentos.demo.local/trabajadores/${trabajador.id}/cedula.pdf` },
      });

      if (!emp.activo) {
        await prisma.activity.create({
          data: { type: "sistema", content: `Baja del empleado: ${emp.motivoBaja}`, trabajadorId: trabajador.id },
        });
        // Una declaración histórica — es la base que usa la liquidación.
        await prisma.declaracionNomina.create({
          data: {
            trabajadorId: trabajador.id,
            periodo: mesAtras(2),
            baseDeclarada: emp.baseline,
            estado: "aprobada",
            riesgo: false,
            createdById: analistaId,
            aprobadaPorId: supervisorId,
          },
        });
        const fechaEgreso = diasDesdeHoy(-25);
        const aniosCompletos = aniosServicioCompletos(fechaIngreso, fechaEgreso);
        const diasBonoVacacional = diasBonoVacacionalLegal(aniosCompletos) + empresa.beneficios.vacacionesDiasExtra;
        const prestaciones = prestacionesSocialesRetroactivo({
          baseMensual: emp.baseline,
          fechaIngreso,
          fechaEgreso,
          diasUtilidadesAnio: empresa.beneficios.utilidadesDiasAnio,
          diasBonoVacacional,
        });
        const diasVacacionesPendientes = diasVacacionesLegal(aniosCompletos);
        const montoVacacionesPendientes = diasVacacionesPendientes * salarioDiario(emp.baseline);
        const mesesAnioEgreso = mesesTrabajadosEnAnio(fechaIngreso, fechaEgreso, fechaEgreso.getFullYear());
        const diasUtilidadesFraccion = diasUtilidadesProporcional(empresa.beneficios.utilidadesDiasAnio, mesesAnioEgreso);
        const montoUtilidadesFraccionadas = diasUtilidadesFraccion * salarioDiario(emp.baseline);
        await prisma.liquidacion.create({
          data: {
            trabajadorId: trabajador.id,
            fechaEgreso,
            motivo: emp.motivoLiquidacion,
            aniosServicio: prestaciones.anios,
            salarioIntegralDiario: prestaciones.salarioIntegralDiario,
            montoPrestaciones: prestaciones.monto,
            diasVacacionesPendientes,
            montoVacacionesPendientes,
            montoUtilidadesFraccionadas,
            total: prestaciones.monto + montoVacacionesPendientes + montoUtilidadesFraccionadas,
            estado: emp.estadoLiquidacion,
            createdById: analistaId,
            fechaPago: emp.estadoLiquidacion === "pagada" ? diasDesdeHoy(-5) : null,
          },
        });
        continue;
      }

      activos.push({ id: trabajador.id, nocturno: emp.nocturno, overtime: emp.overtime });
      if (emp.p0.estado === "aprobada") {
        await prisma.trabajadorDocumento.create({
          data: { trabajadorId: trabajador.id, nombre: "Contrato de trabajo firmado", url: `https://documentos.demo.local/trabajadores/${trabajador.id}/contrato.pdf` },
        });
      }

      // ── Declaraciones (Etapa 1): 2 períodos cerrados + el actual con su escenario ──
      for (const offset of [2, 1]) {
        await prisma.declaracionNomina.create({
          data: {
            trabajadorId: trabajador.id,
            periodo: mesAtras(offset),
            baseDeclarada: emp.baseline,
            estado: "aprobada",
            riesgo: false,
            createdById: analistaId,
            aprobadaPorId: supervisorId,
          },
        });
      }

      const auto = evaluarRiesgoAutomatico({ baseDeclarada: emp.p0.base, salarioMinimo: minimoVigente, baseAnterior: emp.baseline });
      let motivos: MotivoRiesgo[] = auto.motivos;
      let riesgo = auto.riesgo;
      let notaRiesgo: string | null = null;
      let riesgoMarcadoPorId: string | null = null;
      let resueltoPorId: string | null = null;
      let aprobadaPorId: string | null = null;
      let estadoFinal: string = emp.p0.estado;

      if (emp.p0.manualNota) {
        motivos = [...motivos, "manual"];
        riesgo = true;
        notaRiesgo = emp.p0.manualNota;
        riesgoMarcadoPorId = analistaId;
      }
      if (emp.p0.resuelta) {
        notaRiesgo = "Resolución: revisado con el cliente, se corrige a partir del próximo período.";
        resueltoPorId = supervisorId;
        riesgo = false;
        estadoFinal = "en_revision";
      } else if (emp.p0.estado === "bloqueada") {
        riesgo = true;
        estadoFinal = ESTADO_BLOQUEADA;
      } else if (emp.p0.estado === "aprobada") {
        aprobadaPorId = supervisorId;
      }

      await prisma.declaracionNomina.create({
        data: {
          trabajadorId: trabajador.id,
          periodo: p0Periodo,
          baseDeclarada: emp.p0.base,
          estado: estadoFinal,
          riesgo,
          motivoRiesgo: serializeMulti(motivos),
          notaRiesgo,
          riesgoMarcadoPorId,
          resueltoPorId,
          aprobadaPorId,
          createdById: analistaId,
        },
      });

      // ── Vacaciones (2.6): un año de servicio como mínimo ──────────────────────
      if (emp.antiguedad >= 1) {
        const anioServicio = Math.floor(emp.antiguedad);
        const dias = diasVacacionesLegal(anioServicio) + empresa.beneficios.vacacionesDiasExtra;
        const estados = ["pendiente", "disfrutando", "disfrutada"] as const;
        const estadoVac = estados[empleadoIdx % estados.length];
        const frac = estadoVac === "pendiente" ? 0 : estadoVac === "disfrutando" ? 0.5 : 1;
        await prisma.registroVacaciones.create({
          data: {
            trabajadorId: trabajador.id,
            anioServicio,
            fechaCorte: diasDesdeHoy(-10),
            diasCorrespondientes: dias,
            diasTomados: Math.round(dias * frac),
            estado: estadoVac,
            fechaInicio: frac > 0 ? diasDesdeHoy(-20) : null,
            fechaFin: estadoVac === "disfrutada" ? diasDesdeHoy(-20 + dias) : null,
          },
        });
        // La veterana de 17 años lleva un segundo año en el historial — prueba
        // el tope de 30 días y varios registros para el mismo trabajador.
        if (anioServicio >= 16) {
          const diasPrevio = diasVacacionesLegal(anioServicio - 1) + empresa.beneficios.vacacionesDiasExtra;
          await prisma.registroVacaciones.create({
            data: {
              trabajadorId: trabajador.id,
              anioServicio: anioServicio - 1,
              fechaCorte: diasDesdeHoy(-375),
              diasCorrespondientes: diasPrevio,
              diasTomados: diasPrevio,
              estado: "disfrutada",
              fechaInicio: diasDesdeHoy(-400),
              fechaFin: diasDesdeHoy(-400 + diasPrevio),
            },
          });
        }
      }

      // ── Utilidades (2.6): año en curso, prorrateado ───────────────────────────
      const mesesAnio = mesesTrabajadosEnAnio(fechaIngreso, HOY, HOY.getFullYear());
      if (mesesAnio > 0) {
        const diasCalculados = diasUtilidadesProporcional(empresa.beneficios.utilidadesDiasAnio, mesesAnio);
        const montoCalculado = diasCalculados * salarioDiario(emp.p0.base);
        const estados = ["pendiente", "pagado_parcial", "pagado"] as const;
        const estadoUt = estados[empleadoIdx % estados.length];
        const frac = estadoUt === "pendiente" ? 0 : estadoUt === "pagado_parcial" ? 0.5 : 1;
        await prisma.registroUtilidades.create({
          data: {
            trabajadorId: trabajador.id,
            anio: HOY.getFullYear(),
            diasCalculados,
            montoCalculado,
            montoPagado: Math.round(montoCalculado * frac * 100) / 100,
            estado: estadoUt,
            fechaPago: estadoUt === "pagado" ? diasDesdeHoy(-5) : null,
          },
        });
      }
    }

    // ── Asistencia y corridas (2.5) ───────────────────────────────────────────
    const actualCorrida = periodoActualNomina(empresa.frecuenciaPago, HOY);
    const anteriorCorrida = periodoAnteriorNomina(actualCorrida, empresa.frecuenciaPago)!;
    const anteAnteriorCorrida = periodoAnteriorNomina(anteriorCorrida, empresa.frecuenciaPago)!;
    const periodosConAsistencia = [anteAnteriorCorrida, anteriorCorrida, actualCorrida];

    for (const periodo of periodosConAsistencia) {
      const rango = rangoPeriodoNomina(periodo, empresa.frecuenciaPago);
      if (!rango) continue;
      const cursor = new Date(rango.inicio);
      while (cursor.getTime() <= rango.fin.getTime()) {
        const diaSemana = cursor.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) {
          const fecha = fechaLocal(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
          for (const t of activos) {
            await prisma.asistenciaDia.upsert({
              where: { trabajadorId_fecha: { trabajadorId: t.id, fecha } },
              create: { trabajadorId: t.id, fecha, horas: 8 },
              update: { horas: 8 },
            });
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const conceptos = await prisma.conceptoNomina.findMany({ where: { companyId: company.id } });
    const conceptoPorClave = new Map(conceptos.map((c) => [c.clave, c]));
    const aportesTrabajador = await prisma.aporteLegal.findMany({ where: { companyId: company.id, tipo: "trabajador", activo: true } });

    const periodosACorrer = [anteAnteriorCorrida, anteriorCorrida, ...(empresa.correrPeriodoActual ? [actualCorrida] : [])];
    for (const periodo of periodosACorrer) {
      const rango = rangoPeriodoNomina(periodo, empresa.frecuenciaPago);
      const mesDecl = mesDeclaracionDelPeriodo(periodo, empresa.frecuenciaPago);
      if (!rango || !mesDecl) continue;
      const [anioMesDecl, mesMesDecl] = mesDecl.split("-").map(Number);
      const diasMesDecl = diasDelMes(anioMesDecl, mesMesDecl);
      const diasPeriodo = Math.round((rango.fin.getTime() - rango.inicio.getTime()) / 86400000) + 1;

      const corrida = await prisma.corridaNomina.create({
        data: { companyId: company.id, periodo, fechaInicio: rango.inicio, fechaFin: rango.fin, moneda: monedaSalario, estado: "calculada", createdById: analistaId },
      });
      totalCorridas++;

      for (const t of activos) {
        const asistencias = await prisma.asistenciaDia.findMany({ where: { trabajadorId: t.id, fecha: { gte: rango.inicio, lte: rango.fin } } });
        const horasTrabajadas = asistencias.reduce((s, a) => s + a.horas, 0);
        const declaracion = await prisma.declaracionNomina.findUnique({ where: { trabajadorId_periodo: { trabajadorId: t.id, periodo: mesDecl } } });
        const baseMensualReferencia = declaracion?.baseDeclarada ?? 0;
        const baseDevengada = baseProrrateada(baseMensualReferencia, diasPeriodo, diasMesDecl);

        const detalle = await prisma.corridaDetalle.create({
          data: { corridaId: corrida.id, trabajadorId: t.id, horasTrabajadas, baseDevengada, baseMensualReferencia },
        });

        let totalConceptos = 0;
        // El período más reciente de historia lleva horas extra para quien tiene overtime=true
        if (periodo === anteriorCorrida && t.overtime) {
          const concepto = conceptoPorClave.get("hora_extra_diurna");
          if (concepto) {
            const monto = evaluarFormulaConcepto(concepto.formulaAyuda, { sueldo: baseMensualReferencia, horas: 4 });
            await prisma.corridaLinea.create({ data: { detalleId: detalle.id, conceptoId: concepto.id, horasParam: 4, monto } });
            totalConceptos += monto ?? 0;
          }
        }
        if (periodo === anteriorCorrida && t.nocturno) {
          const concepto = conceptoPorClave.get("bono_nocturno");
          if (concepto) {
            const monto = evaluarFormulaConcepto(concepto.formulaAyuda, { sueldo: baseMensualReferencia, horas: 8 });
            await prisma.corridaLinea.create({ data: { detalleId: detalle.id, conceptoId: concepto.id, horasParam: 8, monto } });
            totalConceptos += monto ?? 0;
          }
        }

        const baseParaDeducir = baseDevengada + totalConceptos;
        const totalDeducciones = aportesTrabajador.reduce((s, a) => s + (baseParaDeducir * a.porcentaje) / 100, 0);
        const neto = baseParaDeducir - totalDeducciones;
        await prisma.corridaDetalle.update({ where: { id: detalle.id }, data: { totalConceptos, totalDeducciones, neto } });
      }

      const detalles = await prisma.corridaDetalle.findMany({ where: { corridaId: corrida.id } });
      const totalBruto = detalles.reduce((s, d) => s + d.baseDevengada + d.totalConceptos, 0);
      const totalDeducciones = detalles.reduce((s, d) => s + d.totalDeducciones, 0);
      const totalNeto = detalles.reduce((s, d) => s + d.neto, 0);

      const periodoAnterior = periodoAnteriorNomina(periodo, empresa.frecuenciaPago);
      const corridaAnterior = periodoAnterior
        ? await prisma.corridaNomina.findUnique({ where: { companyId_periodo: { companyId: company.id, periodo: periodoAnterior } } })
        : null;
      const auditoria = auditarCorrida({ totalNeto, totalNetoAnterior: corridaAnterior?.totalNeto ?? null });

      await prisma.corridaNomina.update({
        where: { id: corrida.id },
        data: { totalBruto, totalDeducciones, totalNeto, auditoriaAlerta: auditoria.alerta, auditoriaDetalle: auditoria.detalle },
      });
    }

    const notaPeriodoActual = empresa.correrPeriodoActual ? "" : " + 1 período en curso (solo asistencia)";
    console.log(`  Trabajadores: ${empresa.empleados.length} · Corridas calculadas: ${periodosACorrer.length}${notaPeriodoActual}`);
  }

  console.log("\n── Demo de Nómina lista ─────────────────────────────");
  console.log(`  Clientes con nómina configurada: ${EMPRESAS.length}`);
  console.log(`  Trabajadores creados: ${totalTrabajadores}`);
  console.log(`  Corridas calculadas: ${totalCorridas}`);
  console.log("  Revisa /nomina, /riesgo-nomina y la ficha de cada cliente.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
