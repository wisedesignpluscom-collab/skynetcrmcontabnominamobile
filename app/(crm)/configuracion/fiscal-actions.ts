"use server";

// Gestión del catálogo de obligaciones, del calendario del SENIAT y de los días
// no hábiles. Mismo patrón que service-actions.ts: solo admin, FormData y
// revalidatePath.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { fechaLocal, PERIODICIDADES, REGLAS_VENCIMIENTO, ENTES } from "@/lib/fiscal/vencimientos";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const s = await getSession();
  if (!s || s.role !== "admin") throw new Error("Solo un administrador.");
}

const esPeriodicidad = (v: string) => PERIODICIDADES.some((p) => p.key === v);
const esRegla = (v: string) => REGLAS_VENCIMIENTO.some((r) => r.key === v);
const esEnte = (v: string) => (ENTES as readonly string[]).includes(v);

// `dias_habiles` y `dia_fijo` necesitan su número; las otras reglas no lo usan.
function datosObligacion(formData: FormData) {
  const periodicidad = (formData.get("periodicidad") as string) || "mensual";
  const reglaTipo = (formData.get("reglaTipo") as string) || "dia_fijo";
  const enteReceptor = (formData.get("enteReceptor") as string) || "SENIAT";
  const jurisdiccion = (formData.get("jurisdiccion") as string) === "municipal" ? "municipal" : "nacional";
  const param = Number(formData.get("reglaParam"));
  const pideParam = REGLAS_VENCIMIENTO.find((r) => r.key === reglaTipo)?.pideParam ?? false;
  return {
    nombre: (formData.get("nombre") as string)?.trim() ?? "",
    jurisdiccion,
    periodicidad: esPeriodicidad(periodicidad) ? periodicidad : "mensual",
    enteReceptor: esEnte(enteReceptor) ? enteReceptor : "SENIAT",
    reglaTipo: esRegla(reglaTipo) ? reglaTipo : "dia_fijo",
    reglaParam: pideParam && param > 0 ? Math.trunc(param) : null,
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

// Se guardan los diez dígitos de un año de una sola vez: es como llega la
// providencia. Un día vacío o fuera de rango borra la fila (queda sin cargar,
// y el motor avisará en vez de inventar una fecha).
export async function saveCalendarioSeniat(formData: FormData) {
  await requireAdmin();
  const anio = Number(formData.get("anio"));
  const periodicidad = (formData.get("periodicidad") as string) || "mensual";
  if (!anio || anio < 2000 || anio > 2100 || !esPeriodicidad(periodicidad)) return;

  for (let digito = 0; digito <= 9; digito++) {
    const dia = Number(formData.get(`dia_${digito}`));
    const clave = { anio_periodicidad_digito: { anio, periodicidad, digito } };
    if (dia >= 1 && dia <= 31) {
      await prisma.calendarioSeniat.upsert({
        where: clave,
        update: { diaDelMes: Math.trunc(dia) },
        create: { anio, periodicidad, digito, diaDelMes: Math.trunc(dia) },
      });
    } else {
      await prisma.calendarioSeniat.deleteMany({ where: { anio, periodicidad, digito } });
    }
  }
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
