// Calendario REAL del SENIAT 2026 (Boletín Extraordinario Nº 157, Moore
// Venezuela — Providencias SNAT/2025/000091 y SNAT/2025/000093). No toca
// datos del CRM: solo agrega obligaciones nuevas al catálogo y carga
// CalendarioSeniat. Idempotente (upsert por [anio, obligacionId, mes,
// quincena, digito]) — se puede correr las veces que haga falta:
//
//   npx tsx prisma/seed-calendario-seniat-2026.ts
//
// Requiere que ya haya corrido prisma/seed-obligaciones.ts y
// prisma/seed-fases-obligaciones.ts (esta última crea "Impuesto sobre
// Pensiones (LPPSS) — Forma 19", cuyo calendario real es este mismo).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ANIO = 2026;

// ── Obligaciones nuevas que trae este boletín y no existían en el catálogo ──
const NUEVAS_OBLIGACIONES = [
  {
    nombre: "IVA — Mineras e hidrocarburos",
    jurisdiccion: "nacional",
    periodicidad: "mensual",
    enteReceptor: "SENIAT",
    reglaTipo: "terminacion_rif",
    reglaParam: null,
    notas: "Art. 2, Providencia SNAT/2025/000091 — contribuyentes especiales mineros/hidrocarburos que no perciben regalías.",
    order: 15,
  },
  {
    nombre: "ISLR — Declaración estimada",
    jurisdiccion: "nacional",
    periodicidad: "mensual",
    enteReceptor: "SENIAT",
    reglaTipo: "terminacion_rif",
    reglaParam: null,
    notas: "Declaración y pago de porciones, ejercicios regulares e irregulares (art. 1.b de la Providencia SNAT/2025/000091).",
    order: 45,
  },
  {
    nombre: "Retenciones de ISLR sobre premios de lotería",
    jurisdiccion: "nacional",
    periodicidad: "quincenal",
    enteReceptor: "SENIAT",
    reglaTipo: "terminacion_rif",
    reglaParam: null,
    notas: "Art. 1.e de la Providencia SNAT/2025/000091.",
    order: 42,
  },
  {
    nombre: "Autoliquidación ISLR — Ejercicios irregulares",
    jurisdiccion: "nacional",
    periodicidad: "mensual",
    enteReceptor: "SENIAT",
    reglaTipo: "terminacion_rif",
    reglaParam: null,
    notas:
      "Solo cierres de ejercicio distintos al 31/12. La providencia no trae fecha para cierres de febrero " +
      "(vencimiento en marzo) — el sistema no inventa una, la fija el analista si se da ese caso.",
    order: 55,
  },
  {
    nombre: "Grandes Patrimonios",
    jurisdiccion: "nacional",
    periodicidad: "anual",
    enteReceptor: "SENIAT",
    // No encaja en el motor de "vence el mes siguiente al de cierre": el
    // hecho imponible es el patrimonio neto al 30/09 y vence en oct/nov según
    // el dígito, no un mes fijo tras el cierre. Se deja manual a propósito.
    reglaTipo: "manual",
    reglaParam: null,
    notas:
      "Solo Sujetos Pasivos Especiales. Providencia SNAT/2025/000091 2026: 0 y 8 → 09-oct/13-nov · " +
      "1 y 4 → 14-oct/12-nov · 2 y 3 → 15-oct/09-nov · 5 y 9 → 08-oct/10-nov · 6 y 7 → 13-oct/11-nov.",
    order: 95,
  },
  {
    nombre: "Aporte 70% — Servicios desconcentrados y entes descentralizados",
    jurisdiccion: "nacional",
    periodicidad: "mensual",
    enteReceptor: "SENIAT",
    reglaTipo: "terminacion_rif",
    reglaParam: null,
    notas: "Art. 1.i de la Providencia SNAT/2025/000091 — solo aplica a entes públicos.",
    order: 100,
  },
];

// ── Tablas del boletín ───────────────────────────────────────────────────────

// a.1) Vence días 01-15 del mes de la columna → quincena 2 (Q2 declarada el
// mes anterior vence en este). a.2) Vence días 16-fin → quincena 1.
const IVA_A1: number[][] = [
  [28, 20, 25, 23, 20, 29, 27, 31, 29, 20, 27, 16],
  [19, 23, 20, 27, 18, 26, 21, 25, 18, 28, 26, 29],
  [21, 18, 24, 21, 29, 16, 30, 24, 24, 29, 17, 21],
  [30, 18, 23, 30, 22, 18, 23, 18, 21, 23, 23, 28],
  [23, 25, 26, 20, 21, 19, 28, 19, 30, 22, 20, 22],
  [22, 27, 30, 22, 28, 17, 22, 21, 25, 30, 18, 17],
  [20, 19, 27, 24, 19, 30, 20, 28, 28, 21, 25, 18],
  [27, 24, 18, 17, 26, 22, 31, 20, 22, 27, 19, 18],
  [26, 26, 31, 29, 27, 23, 17, 26, 17, 26, 24, 30],
  [29, 27, 17, 28, 25, 25, 29, 27, 23, 19, 30, 23],
];
const IVA_A2: number[][] = [
  [15, 9, 6, 1, 6, 12, 8, 14, 14, 5, 13, 3],
  [6, 10, 3, 14, 4, 11, 3, 13, 3, 14, 12, 15],
  [8, 5, 9, 8, 14, 3, 14, 12, 10, 15, 2, 4],
  [16, 12, 4, 16, 7, 10, 7, 5, 2, 7, 9, 11],
  [9, 2, 11, 7, 13, 2, 10, 6, 9, 6, 5, 7],
  [5, 13, 12, 9, 15, 8, 6, 3, 15, 8, 4, 10],
  [13, 4, 10, 13, 5, 15, 9, 4, 11, 2, 11, 8],
  [12, 11, 2, 6, 11, 4, 15, 10, 4, 13, 3, 2],
  [7, 3, 13, 10, 12, 5, 2, 7, 8, 9, 6, 9],
  [14, 6, 5, 15, 8, 9, 13, 11, 7, 1, 10, 14],
];

// Grupos "0 y 8" / "1 y 4" / "2 y 3" / "5 y 9" / "6 y 7" → se expanden a los
// 10 dígitos individuales (ambos miembros del grupo comparten fecha).
const GRUPOS: Record<string, number[]> = { "0y8": [0, 8], "1y4": [1, 4], "2y3": [2, 3], "5y9": [5, 9], "6y7": [6, 7] };
function expandirGrupos(grupos: Record<string, number[]>): (number[] | null)[] {
  const porDigito: (number[] | null)[] = Array(10).fill(null);
  for (const [clave, valores] of Object.entries(grupos)) {
    for (const d of GRUPOS[clave]) porDigito[d] = valores;
  }
  return porDigito;
}

// b) Estimadas ISLR (mensual)
const ESTIMADAS_ISLR = expandirGrupos({
  "0y8": [15, 9, 13, 10, 12, 12, 8, 14, 8, 9, 13, 9],
  "1y4": [9, 10, 11, 14, 13, 11, 10, 13, 9, 14, 12, 15],
  "2y3": [8, 12, 9, 8, 14, 10, 14, 12, 10, 15, 9, 11],
  "5y9": [14, 13, 12, 9, 15, 9, 13, 11, 15, 8, 10, 10],
  "6y7": [13, 11, 10, 13, 11, 15, 9, 10, 11, 13, 11, 8],
});

// c) Retenciones ISLR (mensual)
const RETENCIONES_ISLR = expandirGrupos({
  "0y8": [15, 9, 6, 10, 12, 5, 8, 7, 8, 9, 6, 9],
  "1y4": [9, 10, 11, 7, 13, 11, 10, 6, 9, 6, 5, 7],
  "2y3": [8, 5, 9, 8, 7, 10, 7, 12, 10, 7, 9, 4],
  "5y9": [14, 6, 5, 9, 8, 9, 6, 11, 7, 8, 10, 10],
  "6y7": [13, 11, 10, 6, 11, 4, 9, 10, 4, 13, 11, 8],
});

// e.1) Loteria días 01-15 → quincena 2. e.2) días 16-fin → quincena 1.
// Mismo valor para los 10 dígitos ("0 al 9" en el boletín).
const LOTERIA_E1 = [20, 18, 17, 21, 19, 17, 17, 20, 17, 19, 17, 17];
const LOTERIA_E2 = [6, 3, 3, 6, 5, 3, 2, 4, 2, 2, 3, 2];

// g) Ejercicios irregulares — el boletín NO trae marzo (mes 3 se omite a propósito).
const MESES_SIN_MARZO = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const EJERCICIOS_IRREGULARES = expandirGrupos({
  "0y8": [26, 20, 23, 20, 23, 17, 26, 17, 20, 24, 16],
  "1y4": [23, 23, 27, 21, 19, 21, 25, 18, 22, 20, 22],
  "2y3": [21, 18, 21, 22, 18, 23, 24, 21, 23, 17, 21],
  "5y9": [22, 19, 22, 25, 17, 22, 21, 23, 19, 18, 17],
  "6y7": [27, 24, 24, 19, 22, 20, 20, 22, 21, 19, 18],
});

// i) Aporte 70% servicios desconcentrados (mensual)
const APORTE_70 = expandirGrupos({
  "0y8": [15, 9, 13, 10, 12, 12, 8, 14, 8, 9, 13, 9],
  "1y4": [9, 10, 11, 14, 13, 11, 10, 13, 9, 14, 12, 15],
  "2y3": [8, 12, 9, 8, 14, 10, 14, 12, 10, 15, 9, 11],
  "5y9": [14, 13, 12, 9, 15, 9, 13, 11, 15, 8, 10, 10],
  "6y7": [13, 11, 10, 13, 11, 15, 9, 10, 11, 13, 11, 8],
});

// IVA mineras/hidrocarburos (Art. 2, mensual) — mismas cifras que i) en este boletín.
const IVA_MINERO = APORTE_70;

// Pensiones LPPSS (Forma 19, mensual) — mismas cifras que a.1 en este boletín.
const PENSIONES_LPPSS: number[][] = IVA_A1;

const MESES_COMPLETO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

async function cargarTabla(nombreObligacion: string, quincena: number, tabla: (number[] | null)[], meses = MESES_COMPLETO) {
  const obligacion = await prisma.obligacion.findFirst({ where: { nombre: nombreObligacion } });
  if (!obligacion) {
    console.warn(`⚠ No existe la obligación «${nombreObligacion}» — se omite (¿corriste seed-obligaciones.ts / seed-fases-obligaciones.ts?)`);
    return 0;
  }
  let n = 0;
  for (let digito = 0; digito <= 9; digito++) {
    const valores = tabla[digito];
    if (!valores) continue;
    for (let i = 0; i < valores.length; i++) {
      const mes = meses[i];
      const dia = valores[i];
      await prisma.calendarioSeniat.upsert({
        where: {
          anio_obligacionId_mes_quincena_digito: { anio: ANIO, obligacionId: obligacion.id, mes, quincena, digito },
        },
        update: { diaDelMes: dia },
        create: { anio: ANIO, obligacionId: obligacion.id, mes, quincena, digito, diaDelMes: dia },
      });
      n++;
    }
  }
  console.log(`  ✓ ${nombreObligacion} (quincena ${quincena}): ${n} celdas`);
  return n;
}

async function main() {
  for (const o of NUEVAS_OBLIGACIONES) {
    const existente = await prisma.obligacion.findFirst({ where: { nombre: o.nombre } });
    if (existente) {
      await prisma.obligacion.update({ where: { id: existente.id }, data: o });
    } else {
      await prisma.obligacion.create({ data: o });
    }
  }

  // La providencia real ya llegó: Pensiones-LPPSS deja de ser "manual".
  await prisma.obligacion.updateMany({
    where: { nombre: "Impuesto sobre Pensiones (LPPSS) — Forma 19" },
    data: { reglaTipo: "terminacion_rif" },
  });

  console.log("Cargando calendario del SENIAT 2026…");
  let total = 0;
  // "IVA — Sujetos pasivos especiales" es MENSUAL en este catálogo (no
  // quincenal) — una sola declaración por mes, que vence en los primeros 15
  // días del mes siguiente (misma ventana que la tabla a.1 y que la
  // aproximación de día 15 que ya usaba "IVA — Declaración y pago mensual").
  total += await cargarTabla("IVA — Sujetos pasivos especiales", 0, IVA_A1);
  total += await cargarTabla("Retenciones de IVA", 2, IVA_A1);
  total += await cargarTabla("Retenciones de IVA", 1, IVA_A2);
  total += await cargarTabla("IVA — Mineras e hidrocarburos", 0, IVA_MINERO);
  total += await cargarTabla("ISLR — Declaración estimada", 0, ESTIMADAS_ISLR);
  total += await cargarTabla("Retenciones de ISLR", 0, RETENCIONES_ISLR);
  total += await cargarTabla(
    "Retenciones de ISLR sobre premios de lotería",
    2,
    Array(10).fill(LOTERIA_E1)
  );
  total += await cargarTabla(
    "Retenciones de ISLR sobre premios de lotería",
    1,
    Array(10).fill(LOTERIA_E2)
  );
  total += await cargarTabla("Autoliquidación ISLR — Ejercicios irregulares", 0, EJERCICIOS_IRREGULARES, MESES_SIN_MARZO);
  total += await cargarTabla("Aporte 70% — Servicios desconcentrados y entes descentralizados", 0, APORTE_70);
  total += await cargarTabla("Impuesto sobre Pensiones (LPPSS) — Forma 19", 0, PENSIONES_LPPSS);

  console.log(`Listo: ${total} celdas de calendario cargadas/actualizadas para ${ANIO}.`);
  await prisma.$disconnect();
}

main();
