"use server";

// Gestión del catálogo de obligaciones, del calendario del SENIAT y de los días
// no hábiles. Mismo patrón que service-actions.ts: solo admin, FormData y
// revalidatePath.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  fechaLocal,
  PERIODICIDADES,
  REGLAS_VENCIMIENTO,
  ENTES,
  CALENDARIOS_SENIAT,
} from "@/lib/fiscal/vencimientos";
import { esTipoCampo, serializeCampos, type CampoFase } from "@/lib/fases";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const s = await getSession();
  if (!s || s.role !== "admin") throw new Error("Solo un administrador.");
}

const esPeriodicidad = (v: string) => PERIODICIDADES.some((p) => p.key === v);
const esRegla = (v: string) => REGLAS_VENCIMIENTO.some((r) => r.key === v);
const esEnte = (v: string) => (ENTES as readonly string[]).includes(v);
const esCalendarioTipo = (v: string) => CALENDARIOS_SENIAT.some((c) => c.key === v);

// `dias_habiles` y `dia_fijo` necesitan su número; `terminacion_rif` necesita
// qué calendario del SENIAT usa; las otras reglas no usan ninguno de los dos.
function datosObligacion(formData: FormData) {
  const periodicidad = (formData.get("periodicidad") as string) || "mensual";
  const reglaTipo = (formData.get("reglaTipo") as string) || "dia_fijo";
  const enteReceptor = (formData.get("enteReceptor") as string) || "SENIAT";
  const jurisdiccion = (formData.get("jurisdiccion") as string) === "municipal" ? "municipal" : "nacional";
  const param = Number(formData.get("reglaParam"));
  const pideParam = REGLAS_VENCIMIENTO.find((r) => r.key === reglaTipo)?.pideParam ?? false;
  const calendarioTipo = (formData.get("calendarioTipo") as string) || "";
  return {
    nombre: (formData.get("nombre") as string)?.trim() ?? "",
    jurisdiccion,
    periodicidad: esPeriodicidad(periodicidad) ? periodicidad : "mensual",
    enteReceptor: esEnte(enteReceptor) ? enteReceptor : "SENIAT",
    reglaTipo: esRegla(reglaTipo) ? reglaTipo : "dia_fijo",
    reglaParam: pideParam && param > 0 ? Math.trunc(param) : null,
    calendarioTipo: reglaTipo === "terminacion_rif" && esCalendarioTipo(calendarioTipo) ? calendarioTipo : null,
    municipio: jurisdiccion === "municipal" ? (formData.get("municipio") as string)?.trim() || null : null,
    notas: (formData.get("notas") as string)?.trim() || null,
  };
}

export async function addObligacion(formData: FormData) {
  await requireAdmin();
  const datos = datosObligacion(formData);
  if (!datos.nombre) return;
  const ultima = await prisma.obligacion.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  await prisma.obligacion.create({ data: { ...datos, order: (ultima?.order ?? 0) + 10 } });
  revalidatePath("/configuracion");
}

export async function updateObligacion(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  const datos = datosObligacion(formData);
  if (!id || !datos.nombre) return;
  await prisma.obligacion.update({ where: { id }, data: datos });
  revalidatePath("/configuracion");
}

export async function toggleObligacion(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.obligacion.update({
    where: { id },
    data: { active: formData.get("active") === "true" },
  });
  revalidatePath("/configuracion");
}

// ── Calendario del SENIAT ───────────────────────────────────────────────────

// Se guarda UNA tabla (los 10 dígitos × 12 meses) de una sola vez: es como
// llega cada tabla de la providencia. Los calendarios quincenales tienen dos
// tablas (una por quincena) que se guardan por separado — por eso `quincena`
// viene fijo en el propio formulario, y solo se toca esa quincena; la otra no
// se ve afectada. Una celda vacía o fuera de rango borra esa fila puntual
// (queda sin cargar, y el motor avisará en vez de inventar una fecha).
export async function saveCalendarioSeniat(formData: FormData) {
  await requireAdmin();
  const anio = Number(formData.get("anio"));
  const tipo = (formData.get("tipo") as string) || "";
  const calDef = CALENDARIOS_SENIAT.find((c) => c.key === tipo);
  if (!anio || anio < 2000 || anio > 2100 || !calDef) return;

  const quincenaRaw = formData.get("quincena");
  const quincena = calDef.periodicidad === "quincenal" ? Number(quincenaRaw) : 0;
  if (calDef.periodicidad === "quincenal" && quincena !== 1 && quincena !== 2) return;

  const tareas: Promise<unknown>[] = [];
  for (let digito = 0; digito <= 9; digito++) {
    for (let mes = 1; mes <= 12; mes++) {
      const campo = quincena ? `dia_${digito}_${mes}_${quincena}` : `dia_${digito}_${mes}`;
      const dia = Number(formData.get(campo));
      const clave = { anio_tipo_digito_mes_quincena: { anio, tipo, digito, mes, quincena } };
      if (dia >= 1 && dia <= 31) {
        tareas.push(
          prisma.calendarioSeniat.upsert({
            where: clave,
            update: { diaDelMes: Math.trunc(dia), periodicidad: calDef.periodicidad },
            create: {
              anio,
              tipo,
              periodicidad: calDef.periodicidad,
              digito,
              mes,
              quincena,
              diaDelMes: Math.trunc(dia),
            },
          })
        );
      } else {
        tareas.push(prisma.calendarioSeniat.deleteMany({ where: { anio, tipo, digito, mes, quincena } }));
      }
    }
  }
  await Promise.all(tareas);
  revalidatePath("/configuracion");
}

// ── Días no hábiles ─────────────────────────────────────────────────────────

export async function addDiaNoHabil(formData: FormData) {
  await requireAdmin();
  const raw = (formData.get("fecha") as string)?.trim();
  const motivo = (formData.get("motivo") as string)?.trim();
  const municipio = (formData.get("municipio") as string)?.trim() || "";
  if (!raw || !motivo) return;
  const [anio, mes, dia] = raw.split("-").map(Number);
  if (!anio || !mes || !dia) return;
  // Mediodía local, como el resto de las fechas del sistema
  const fecha = fechaLocal(anio, mes, dia);
  await prisma.diaNoHabil.upsert({
    where: { fecha_municipio: { fecha, municipio } },
    update: { motivo },
    create: { fecha, motivo, municipio },
  });
  revalidatePath("/configuracion");
}

export async function deleteDiaNoHabil(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.diaNoHabil.delete({ where: { id } });
  revalidatePath("/configuracion");
}

// ── Checklist de fases por obligación ───────────────────────────────────────
// La plantilla que define, para cada tipo de obligación, los pasos que hay
// que cumplir en orden para dar por hecha la gestión (§ manual de
// procedimientos). Cada fase pide de 0 a 3 campos de evidencia — el mismo
// límite fijo que usa el resto de la UI de este panel (nada de arrays
// dinámicos en el formulario).

function campoDesdeFormulario(formData: FormData, n: 1 | 2 | 3): CampoFase | null {
  const label = (formData.get(`campo${n}_label`) as string)?.trim();
  const tipoRaw = (formData.get(`campo${n}_tipo`) as string) ?? "texto";
  if (!label) return null;
  return {
    id: `c${n}`,
    label,
    tipo: esTipoCampo(tipoRaw) ? tipoRaw : "texto",
    requerido: formData.get(`campo${n}_requerido`) === "on",
  };
}

function camposDesdeFormulario(formData: FormData): CampoFase[] {
  return [1, 2, 3]
    .map((n) => campoDesdeFormulario(formData, n as 1 | 2 | 3))
    .filter((c): c is CampoFase => c !== null);
}

export async function addFaseObligacion(formData: FormData) {
  await requireAdmin();
  const obligacionId = formData.get("obligacionId") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  if (!obligacionId || !nombre) return;
  const ultima = await prisma.faseObligacion.findFirst({
    where: { obligacionId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  await prisma.faseObligacion.create({
    data: {
      obligacionId,
      order: (ultima?.order ?? 0) + 10,
      nombre,
      descripcion: (formData.get("descripcion") as string)?.trim() || null,
      campos: serializeCampos(camposDesdeFormulario(formData)),
    },
  });
  revalidatePath("/configuracion");
}

export async function updateFaseObligacion(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  if (!id || !nombre) return;
  await prisma.faseObligacion.update({
    where: { id },
    data: {
      nombre,
      descripcion: (formData.get("descripcion") as string)?.trim() || null,
      campos: serializeCampos(camposDesdeFormulario(formData)),
    },
  });
  revalidatePath("/configuracion");
}

export async function deleteFaseObligacion(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.faseObligacion.delete({ where: { id } });
  revalidatePath("/configuracion");
}

// Sube o baja una fase intercambiando su `order` con el vecino — mismo patrón
// que moveStage en las etapas del pipeline.
export async function moveFaseObligacion(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  const direccion = formData.get("direccion") as string;
  if (!id || (direccion !== "arriba" && direccion !== "abajo")) return;

  const fase = await prisma.faseObligacion.findUnique({ where: { id } });
  if (!fase) return;
  const vecina = await prisma.faseObligacion.findFirst({
    where: {
      obligacionId: fase.obligacionId,
      order: direccion === "arriba" ? { lt: fase.order } : { gt: fase.order },
    },
    orderBy: { order: direccion === "arriba" ? "desc" : "asc" },
  });
  if (!vecina) return;

  await prisma.$transaction([
    prisma.faseObligacion.update({ where: { id: fase.id }, data: { order: vecina.order } }),
    prisma.faseObligacion.update({ where: { id: vecina.id }, data: { order: fase.order } }),
  ]);
  revalidatePath("/configuracion");
}
