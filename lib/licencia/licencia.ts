// Verificación de la licencia — módulo PURO (sin Prisma, sin Next, sin acceso
// a disco). Recibe el texto de la licencia y la huella del equipo, y decide si
// el sistema puede funcionar. Se prueba solo, como lib/engine/evaluator.ts.
//
// Diseño:
//
//  · La licencia se firma con **Ed25519** usando una clave privada que vive solo
//    en la máquina del proveedor. El sistema lleva incrustada la clave pública,
//    así que puede verificar pero NO puede fabricar licencias.
//  · La huella del equipo son tres componentes (placa, disco, red). Se exige que
//    coincidan **2 de 3**: cambiar un disco o una tarjeta de red no debe dejar a
//    la firma sin sistema, pero copiar la carpeta a otro equipo sí falla.
//  · Nunca se responde solo «inválida»: se devuelve un motivo en español y, si
//    corresponde, un período de gracia. Un sistema que se apaga de golpe en
//    plena semana de vencimientos es peor que una copia no autorizada.

import { createPublicKey, verify as verificarFirma } from "node:crypto";

// Días que el sistema sigue funcionando cuando la licencia falta o vence.
// Suficiente para que el técnico consiga una nueva sin frenar a la firma.
export const DIAS_DE_GRACIA = 15;

// Componentes de huella que deben coincidir para dar el equipo por el mismo.
export const COMPONENTES_MINIMOS = 2;

export type Huella = {
  // Identificador de la placa madre (lo más estable del equipo)
  placa: string;
  // Número de serie del disco del sistema
  disco: string;
  // MAC de la tarjeta de red principal
  red: string;
};

export type PayloadLicencia = {
  // Nombre de la firma a la que se le licenció. Aparece en la UI: si una copia
  // circula, dice de dónde salió.
  cliente: string;
  // Huella del equipo autorizado
  huella: Huella;
  // ISO. La licencia no vale antes de esta fecha
  emitida: string;
  // ISO u omitido para licencia perpetua
  expira?: string;
  // Referencia interna del proveedor (número de contrato, etc.)
  referencia?: string;
};

export type Licencia = {
  payload: PayloadLicencia;
  // Firma Ed25519 del payload canónico, en base64
  firma: string;
};

export type EstadoLicencia =
  | "valida"
  | "gracia_sin_licencia"
  | "gracia_vencida"
  | "invalida";

export type Resultado = {
  estado: EstadoLicencia;
  // Puede el sistema funcionar ahora
  operativo: boolean;
  // Mensaje en español para mostrar al usuario o al técnico
  motivo: string;
  cliente?: string;
  expira?: string;
  // Días que quedan de gracia (solo en los estados de gracia)
  diasRestantes?: number;
};

// El payload se serializa siempre igual para firmar y verificar: claves
// ordenadas, sin espacios. Si esto cambia, las licencias emitidas dejan de valer.
export function canonizar(payload: PayloadLicencia): string {
  const h = payload.huella;
  const orden: Record<string, unknown> = {
    cliente: payload.cliente,
    emitida: payload.emitida,
    expira: payload.expira ?? null,
    huella: { disco: h.disco, placa: h.placa, red: h.red },
    referencia: payload.referencia ?? null,
  };
  return JSON.stringify(orden);
}

// Compara dos huellas: cuántos componentes coinciden (sin distinguir mayúsculas
// ni espacios, que es como los devuelve Windows según la versión).
export function componentesQueCoinciden(a: Huella, b: Huella): number {
  const limpia = (v: string | undefined) => (v ?? "").trim().toUpperCase().replace(/\s+/g, "");
  let iguales = 0;
  for (const clave of ["placa", "disco", "red"] as const) {
    const va = limpia(a[clave]);
    const vb = limpia(b[clave]);
    // Un componente vacío no cuenta: no se puede afirmar que coincide
    if (va && vb && va === vb) iguales++;
  }
  return iguales;
}

export function mismoEquipo(a: Huella, b: Huella): boolean {
  return componentesQueCoinciden(a, b) >= COMPONENTES_MINIMOS;
}

function dias(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000);
}

export function parseLicencia(texto: string | null | undefined): Licencia | null {
  if (!texto) return null;
  try {
    const obj = JSON.parse(texto) as Licencia;
    if (!obj?.payload?.cliente || !obj?.payload?.huella || typeof obj.firma !== "string") {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

// Verifica la firma con la clave pública incrustada en el sistema.
export function firmaValida(licencia: Licencia, clavePublicaPem: string): boolean {
  try {
    const clave = createPublicKey(clavePublicaPem);
    return verificarFirma(
      null, // Ed25519 no usa algoritmo de hash aparte
      Buffer.from(canonizar(licencia.payload), "utf8"),
      clave,
      Buffer.from(licencia.firma, "base64")
    );
  } catch {
    return false;
  }
}

export type EntradaEvaluacion = {
  // Contenido del archivo licencia.lic, o null si no existe
  texto: string | null;
  // Huella del equipo donde se está ejecutando
  huella: Huella;
  clavePublicaPem: string;
  // Cuándo se instaló el sistema: de aquí se cuenta la gracia sin licencia
  instaladoEl: Date;
  ahora?: Date;
};

export function evaluarLicencia({
  texto,
  huella,
  clavePublicaPem,
  instaladoEl,
  ahora = new Date(),
}: EntradaEvaluacion): Resultado {
  const licencia = parseLicencia(texto);

  // ── Sin licencia: gracia desde la instalación ──
  if (!licencia) {
    const usados = dias(instaladoEl, ahora);
    const restantes = DIAS_DE_GRACIA - usados;
    if (restantes > 0) {
      return {
        estado: "gracia_sin_licencia",
        operativo: true,
        diasRestantes: restantes,
        motivo:
          `Este sistema todavía no tiene licencia. Seguirá funcionando ${restantes} ` +
          `día${restantes === 1 ? "" : "s"} más. Solicita la licencia a tu proveedor.`,
      };
    }
    return {
      estado: "invalida",
      operativo: false,
      motivo:
        "Este sistema no tiene licencia y el período de prueba terminó. " +
        "Contacta a tu proveedor para activarlo.",
    };
  }

  // ── Firma ──
  if (!firmaValida(licencia, clavePublicaPem)) {
    return {
      estado: "invalida",
      operativo: false,
      motivo:
        "El archivo de licencia no es auténtico o fue modificado. " +
        "Solicita una licencia válida a tu proveedor.",
    };
  }

  const { payload } = licencia;

  // ── Equipo ──
  if (!mismoEquipo(payload.huella, huella)) {
    return {
      estado: "invalida",
      operativo: false,
      cliente: payload.cliente,
      motivo:
        "Esta licencia pertenece a otro equipo. Si cambiaste de servidor o " +
        "reemplazaste componentes, pide a tu proveedor una licencia para el equipo actual.",
    };
  }

  // ── Vigencia ──
  if (payload.expira) {
    const expira = new Date(payload.expira);
    if (!Number.isNaN(expira.getTime()) && ahora > expira) {
      const vencidaHace = dias(expira, ahora);
      const restantes = DIAS_DE_GRACIA - vencidaHace;
      if (restantes > 0) {
        return {
          estado: "gracia_vencida",
          operativo: true,
          cliente: payload.cliente,
          expira: payload.expira,
          diasRestantes: restantes,
          motivo:
            `La licencia venció. El sistema seguirá funcionando ${restantes} ` +
            `día${restantes === 1 ? "" : "s"} más: renuévala con tu proveedor.`,
        };
      }
      return {
        estado: "invalida",
        operativo: false,
        cliente: payload.cliente,
        expira: payload.expira,
        motivo: "La licencia venció y el período de gracia terminó. Renuévala con tu proveedor.",
      };
    }
  }

  return {
    estado: "valida",
    operativo: true,
    cliente: payload.cliente,
    expira: payload.expira,
    motivo: `Licencia válida para ${payload.cliente}.`,
  };
}
