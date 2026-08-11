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

// Se guarda de una sola vez el calendario COMPLETO de una obligación para un
// año: 12 meses × (1 o 2 quincenas, según la periodicidad) × 10 dígitos — tal
// como lo publica la providencia real del SENIAT (el día varía mes a mes, no
// es un valor fijo repetido). Los campos que la UI no llegó a renderizar
// (quincena que no aplica a esa obligación) simplemente no vienen en el
// FormData y se saltan. Un día vacío o fuera de rango borra esa celda — el
// motor avisará en vez de inventar una fecha.
export async function saveCalendarioSeniat(formData: FormData) {
  await requireAdmin();
  const anio = Number(formData.get("anio"));
  const obligacionId = formData.get("obligacionId") as string;
  if (!anio || anio < 2000 || anio > 2100 || !obligacionId) return;
  const existe = await prisma.obligacion.findUnique({ where: { id: obligacionId }, select: { id: true } });
  if (!existe) return;

  const tareas: Promise<unknown>[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    for (const quincena of [0, 1, 2]) {
      for (let digito = 0; digito <= 9; digito++) {
        const raw = formData.get(`dia_${quincena}_${mes}_${digito}`);
        if (raw === null) continue;
        const dia = Number(raw);
        const clave = { anio_obligacionId_mes_quincena_digito: { anio, obligacionId, mes, quincena, digito } };
        tareas.push(
          dia >= 1 && dia <= 31
            ? prisma.calendarioSeniat.upsert({
                where: clave,
                update: { diaDelMes: Math.trunc(dia) },
                create: { anio, obligacionId, mes, quincena, digito, diaDelMes: Math.trunc(dia) },
              })
            : prisma.calendarioSeniat.deleteMany({ where: { anio, obligacionId, mes, quincena, digito } })
        );
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
