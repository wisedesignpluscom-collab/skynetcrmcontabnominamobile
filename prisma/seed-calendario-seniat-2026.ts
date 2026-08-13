// Calendario REAL del SENIAT para Sujetos Pasivos Especiales — año 2026.
// Fuente: Boletín Extraordinario Nº 157 (Moore Venezuela), Gaceta Oficial
// Nº 43.283 del 23/12/2025, Providencia Nº SNAT/2025/000091 (calendario de
// obligaciones) y Gaceta Oficial Nº 43.273 del 09/12/2025, Providencia
// Nº SNAT/2025/000093 (contribución especial de pensiones).
//
// Cada fila del calendario se identifica por el MES DE CIERRE del período (no
// el de vencimiento — ver lib/fiscal/vencimientos.ts), que es exactamente la
// columna del mes tal como la publica la providencia.
//
// Idempotente (upsert por año+tipo+dígito+mes+quincena):
//   npx tsx prisma/seed-calendario-seniat-2026.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ANIO = 2026;

// 12 valores = ENE..DIC. `null` = ese mes no está en la tabla de la providencia.
type Fila12 = (number | null)[];

function expandir(filas: Record<string, Fila12>, gruposDeDigitos: Record<string, number[]>) {
  const porDigito: Record<number, Fila12> = {};
  for (const [grupo, valores] of Object.entries(filas)) {
    for (const digito of gruposDeDigitos[grupo]) porDigito[digito] = valores;
  }
  return porDigito;
}

// Grupos "0 y 8", "1 y 4", etc. de las tablas de porciones/retenciones ISLR.
const GRUPOS_ISLR: Record<string, number[]> = {
  "0y8": [0, 8],
  "1y4": [1, 4],
  "2y3": [2, 3],
  "5y9": [5, 9],
  "6y7": [6, 7],
};

// ── a) IVA y retenciones de IVA — Art. 1 literal a) ─────────────────────────
// a.1: retenciones/operaciones practicadas entre el 01 y el 15 → primera quincena.
const IVA_RETENCIONES_Q1: Record<number, Fila12> = {
  0: [28, 20, 25, 23, 20, 29, 27, 31, 29, 20, 27, 16],
  1: [19, 23, 20, 27, 18, 26, 21, 25, 18, 28, 26, 29],
  2: [21, 18, 24, 21, 29, 16, 30, 24, 24, 29, 17, 21],
  3: [30, 18, 23, 30, 22, 18, 23, 18, 21, 23, 23, 28],
  4: [23, 25, 26, 20, 21, 19, 28, 19, 30, 22, 20, 22],
  5: [22, 27, 30, 22, 28, 17, 22, 21, 25, 30, 18, 17],
  6: [20, 19, 27, 24, 19, 30, 20, 28, 28, 21, 25, 18],
  7: [27, 24, 18, 17, 26, 22, 31, 20, 22, 27, 19, 18],
  8: [26, 26, 31, 29, 27, 23, 17, 26, 17, 26, 24, 30],
  9: [29, 27, 17, 28, 25, 25, 29, 27, 23, 19, 30, 23],
};
// a.2: retenciones/operaciones practicadas entre el 16 y el último día → segunda quincena.
const IVA_RETENCIONES_Q2: Record<number, Fila12> = {
  0: [15, 9, 6, 1, 6, 12, 8, 14, 14, 5, 13, 3],
  1: [6, 10, 3, 14, 4, 11, 3, 13, 3, 14, 12, 15],
  2: [8, 5, 9, 8, 14, 3, 14, 12, 10, 15, 2, 4],
  3: [16, 12, 4, 16, 7, 10, 7, 5, 2, 7, 9, 11],
  4: [9, 2, 11, 7, 13, 2, 10, 6, 9, 6, 5, 7],
  5: [5, 13, 12, 9, 15, 8, 6, 3, 15, 8, 4, 10],
  6: [13, 4, 10, 13, 5, 15, 9, 4, 11, 2, 11, 8],
  7: [12, 11, 2, 6, 11, 4, 15, 10, 4, 13, 3, 2],
  8: [7, 3, 13, 10, 12, 5, 2, 7, 8, 9, 6, 9],
  9: [14, 6, 5, 15, 8, 9, 13, 11, 7, 1, 10, 14],
};

// ── b) ISLR — Porciones de la declaración estimada — Art. 1 literal b) ─────
const ISLR_ESTIMADA = expandir(
  {
    "0y8": [15, 9, 13, 10, 12, 12, 8, 14, 8, 9, 13, 9],
    "1y4": [9, 10, 11, 14, 13, 11, 10, 13, 9, 14, 12, 15],
    "2y3": [8, 12, 9, 8, 14, 10, 14, 12, 10, 15, 9, 11],
    "5y9": [14, 13, 12, 9, 15, 9, 13, 11, 15, 8, 10, 10],
    "6y7": [13, 11, 10, 13, 11, 15, 9, 10, 11, 13, 11, 8],
  },
  GRUPOS_ISLR
);

// ── c) Retenciones de ISLR — Art. 1 literal c) ──────────────────────────────
const ISLR_RETENCIONES = expandir(
  {
    "0y8": [15, 9, 6, 10, 12, 5, 8, 7, 8, 9, 6, 9],
    "1y4": [9, 10, 11, 7, 13, 11, 10, 6, 9, 6, 5, 7],
    "2y3": [8, 5, 9, 8, 7, 10, 7, 12, 10, 7, 9, 4],
    "5y9": [14, 6, 5, 9, 8, 9, 6, 11, 7, 8, 10, 10],
    "6y7": [13, 11, 10, 6, 11, 4, 9, 10, 4, 13, 11, 8],
  },
  GRUPOS_ISLR
);

// ── d) Actividades de juegos de envite o azar — Art. 1 literal d) ──────────
// Una sola fila para todos los dígitos (0 al 9).
const JUEGOS_ENVITE_FILA: Fila12 = [9, 9, 9, 8, 11, 9, 9, 10, 8, 8, 10, 9];

// ── e) Retenciones de ISLR — Premios de lotería — Art. 1 literal e) ─────────
const LOTERIA_Q1_FILA: Fila12 = [20, 18, 17, 21, 19, 17, 17, 20, 17, 19, 17, 17];
const LOTERIA_Q2_FILA: Fila12 = [6, 3, 3, 6, 5, 3, 2, 4, 2, 2, 3, 2];

// ── g) ISLR — Autoliquidación ejercicios irregulares — Art. 1 literal g) ───
// La providencia no trae columna de marzo para esta tabla.
const ISLR_IRREGULAR = expandir(
  {
    "0y8": [26, 20, null, 23, 20, 23, 17, 26, 17, 20, 24, 16],
    "1y4": [23, 23, null, 27, 21, 19, 21, 25, 18, 22, 20, 22],
    "2y3": [21, 18, null, 21, 22, 18, 23, 24, 21, 23, 17, 21],
    "5y9": [22, 19, null, 22, 25, 17, 22, 21, 23, 19, 18, 17],
    "6y7": [27, 24, null, 24, 19, 22, 20, 20, 22, 21, 19, 18],
  },
  GRUPOS_ISLR
);

// ── i) Aporte 70% — Entes descentralizados y autónomos — Art. 1 literal i) ─
const APORTE_70_ENTES = expandir(
  {
    "0y8": [15, 9, 13, 10, 12, 12, 8, 14, 8, 9, 13, 9],
    "1y4": [9, 10, 11, 14, 13, 11, 10, 13, 9, 14, 12, 15],
    "2y3": [8, 12, 9, 8, 14, 10, 14, 12, 10, 15, 9, 11],
    "5y9": [14, 13, 12, 9, 15, 9, 13, 11, 15, 8, 10, 10],
    "6y7": [13, 11, 10, 13, 11, 15, 9, 10, 11, 13, 11, 8],
  },
  GRUPOS_ISLR
);

// ── IVA — Minería e hidrocarburos (SPE) — Art. 2 ────────────────────────────
const IVA_MINERIA = expandir(
  {
    "0y8": [15, 9, 13, 10, 12, 12, 8, 14, 8, 9, 13, 9],
    "1y4": [9, 10, 11, 14, 13, 11, 10, 13, 9, 14, 12, 15],
    "2y3": [8, 12, 9, 8, 14, 10, 14, 12, 10, 15, 9, 11],
    "5y9": [14, 13, 12, 9, 15, 9, 13, 11, 15, 8, 10, 10],
    "6y7": [13, 11, 10, 13, 11, 15, 9, 10, 11, 13, 11, 8],
  },
  GRUPOS_ISLR
);

// ── Contribución especial — Pensiones de seguridad social ───────────────────
// (Providencia SNAT/2025/000093 — Gaceta 43.273 del 09/12/2025, Art. 1)
const PENSIONES_CONTRIBUCION: Record<number, Fila12> = {
  0: [28, 20, 25, 23, 20, 29, 27, 31, 29, 20, 27, 16],
  1: [19, 23, 20, 27, 18, 26, 21, 25, 18, 28, 26, 29],
  2: [21, 18, 24, 21, 29, 16, 30, 24, 24, 29, 17, 21],
  3: [30, 18, 23, 30, 22, 18, 23, 18, 21, 23, 23, 28],
  4: [23, 25, 26, 20, 21, 19, 28, 19, 30, 22, 20, 22],
  5: [22, 27, 30, 22, 28, 17, 22, 21, 25, 30, 18, 17],
  6: [20, 19, 27, 24, 19, 30, 20, 28, 28, 21, 25, 18],
  7: [27, 24, 18, 17, 26, 22, 31, 20, 22, 27, 19, 18],
  8: [26, 26, 31, 29, 27, 23, 17, 26, 17, 26, 24, 30],
  9: [29, 27, 17, 28, 25, 25, 29, 27, 23, 19, 30, 23],
};

function filaUnicaPorDigito(fila: Fila12): Record<number, Fila12> {
  const porDigito: Record<number, Fila12> = {};
  for (let d = 0; d <= 9; d++) porDigito[d] = fila;
  return porDigito;
}

type TablaACargar = {
  tipo: string;
  periodicidad: "mensual" | "quincenal";
  quincena: number; // 0 = no aplica
  porDigito: Record<number, Fila12>;
};

const TABLAS: TablaACargar[] = [
  { tipo: "iva_retenciones", periodicidad: "quincenal", quincena: 1, porDigito: IVA_RETENCIONES_Q1 },
  { tipo: "iva_retenciones", periodicidad: "quincenal", quincena: 2, porDigito: IVA_RETENCIONES_Q2 },
  { tipo: "islr_estimada", periodicidad: "mensual", quincena: 0, porDigito: ISLR_ESTIMADA },
  { tipo: "islr_retenciones", periodicidad: "mensual", quincena: 0, porDigito: ISLR_RETENCIONES },
  { tipo: "juegos_envite", periodicidad: "mensual", quincena: 0, porDigito: filaUnicaPorDigito(JUEGOS_ENVITE_FILA) },
  { tipo: "loteria_retenciones", periodicidad: "quincenal", quincena: 1, porDigito: filaUnicaPorDigito(LOTERIA_Q1_FILA) },
  { tipo: "loteria_retenciones", periodicidad: "quincenal", quincena: 2, porDigito: filaUnicaPorDigito(LOTERIA_Q2_FILA) },
  { tipo: "islr_irregular", periodicidad: "mensual", quincena: 0, porDigito: ISLR_IRREGULAR },
  { tipo: "aporte_70_entes", periodicidad: "mensual", quincena: 0, porDigito: APORTE_70_ENTES },
  { tipo: "iva_mineria", periodicidad: "mensual", quincena: 0, porDigito: IVA_MINERIA },
  { tipo: "pensiones_contribucion", periodicidad: "mensual", quincena: 0, porDigito: PENSIONES_CONTRIBUCION },
];

async function main() {
  let filas = 0;
  for (const tabla of TABLAS) {
    for (const [digitoTexto, valores] of Object.entries(tabla.porDigito)) {
      const digito = Number(digitoTexto);
      for (let i = 0; i < 12; i++) {
        const dia = valores[i];
        if (dia === null || dia === undefined) continue;
        const mes = i + 1;
        await prisma.calendarioSeniat.upsert({
          where: {
            anio_tipo_digito_mes_quincena: { anio: ANIO, tipo: tabla.tipo, digito, mes, quincena: tabla.quincena },
          },
          update: { diaDelMes: dia, periodicidad: tabla.periodicidad },
          create: {
            anio: ANIO,
            tipo: tabla.tipo,
            periodicidad: tabla.periodicidad,
            digito,
            mes,
            quincena: tabla.quincena,
            diaDelMes: dia,
          },
        });
        filas++;
      }
    }
  }
  console.log(`Calendario del SENIAT ${ANIO}: ${filas} celdas cargadas en ${TABLAS.length} tablas.`);
  await prisma.$disconnect();
}

main();
