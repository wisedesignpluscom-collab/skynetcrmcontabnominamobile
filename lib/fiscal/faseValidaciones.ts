// Validaciones "especiales" de una fase: las que necesitan mirar OTROS
// registros (un chequeo de campo suelto vive en lib/casos-fases.ts, que es
// puro). Registro pequeño keyed por ObligacionFase.validacionEspecial —
// server-only, consulta Prisma.
import { prisma } from "@/lib/prisma";
import type { EvidenciaCampoSpec } from "@/lib/casos-fases";
import { isRifValido, normalizeRif, MENSAJE_RIF_INVALIDO } from "@/lib/rif";

type ContextoValidacion = {
  companyId: string;
  casoId: string;
  obligacionFaseId: string;
  campos: EvidenciaCampoSpec[];
  datos: Record<string, unknown>;
};

type ValidadorEspecial = (ctx: ContextoValidacion) => Promise<string[]>;

function firmaDe(datos: Record<string, unknown>, claves: string[]): string {
  return claves.map((k) => String(datos[k] ?? "").trim().toLowerCase()).join("|");
}

// Ninguna otra CasoFase completada de la MISMA fase, en la MISMA empresa,
// puede tener los mismos valores en los campos marcados `claveUnicidad`. Se
// compara en JS parseando el JSON de `datos` — no una query JSON del motor,
// para mantener portabilidad SQLite/PostgreSQL (mismo criterio que
// auditarCorrida en lib/corridas.ts).
const sinDuplicado: ValidadorEspecial = async ({ companyId, casoId, obligacionFaseId, campos, datos }) => {
  const clavesUnicas = campos.filter((c) => c.claveUnicidad).map((c) => c.clave);
  if (clavesUnicas.length === 0) return [];

  const firma = firmaDe(datos, clavesUnicas);
  if (!firma.replace(/\|/g, "")) return [];

  const otras = await prisma.casoFase.findMany({
    where: { obligacionFaseId, estado: "completada", casoId: { not: casoId }, caso: { companyId } },
    select: { datos: true },
  });

  for (const otra of otras) {
    if (!otra.datos) continue;
    let otrosDatos: Record<string, unknown>;
    try {
      otrosDatos = JSON.parse(otra.datos);
    } catch {
      continue;
    }
    if (firmaDe(otrosDatos, clavesUnicas) === firma) {
      return [`Ya existe otro registro con los mismos datos (${clavesUnicas.join(", ")}) en esta empresa — revisa duplicidad`];
    }
  }
  return [];
};

// El RIF de la fase "Tramitar el RIF ante el SENIAT" (Etapa 3.6, apertura de
// empresa) debe tener formato válido y no estar ya usado por OTRO cliente —
// Company.rif es @unique, así que este chequeo evita el P2002 tardío al
// guardar el cliente y avisa antes, con el mensaje ya establecido en F1.
const rifValido: ValidadorEspecial = async ({ companyId, datos }) => {
  const raw = String(datos.rif ?? "").trim();
  if (!raw) return [];
  if (!isRifValido(raw)) return [MENSAJE_RIF_INVALIDO];

  const existente = await prisma.company.findFirst({
    where: { rif: normalizeRif(raw), NOT: { id: companyId } },
    select: { id: true },
  });
  return existente ? ["Ese RIF ya está registrado en otro cliente."] : [];
};

const VALIDADORES: Record<string, ValidadorEspecial> = {
  sin_duplicado: sinDuplicado,
  rif_valido: rifValido,
};

export async function validarEspecial(
  codigo: string | null | undefined,
  ctx: ContextoValidacion
): Promise<string[]> {
  if (!codigo) return [];
  const validador = VALIDADORES[codigo];
  return validador ? validador(ctx) : [];
}
