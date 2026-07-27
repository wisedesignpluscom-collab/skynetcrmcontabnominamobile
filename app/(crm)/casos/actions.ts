"use server";

// Bandeja de casos recurrentes (F4). Cada cambio de estado emite su evento del
// Automation Engine: el loop (clonar el período siguiente, avisar al supervisor,
// pedir soportes) lo arman las reglas, no estas acciones.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canReassign, recurringCaseScope } from "@/lib/permissions";
import { esCausaAtraso, esEstadoCaso } from "@/lib/casos";
import { emitEventAndProcess } from "@/lib/engine/queue";
import { generarCasosDelPeriodo } from "@/lib/fiscal/casos";
import { fechaLocal } from "@/lib/fiscal/vencimientos";
import { revalidatePath } from "next/cache";

// El analista solo toca los casos de su alcance (protección ante POST directo).
async function casoAccesible(id: string) {
  const session = await getSession();
  if (!session || !id) return null;
  const caso = await prisma.casoRecurrente.findFirst({
    where: { id, ...recurringCaseScope(session) },
    include: { company: true, obligacion: true },
  });
  return caso ? { session, caso } : null;
}

function fechaDeFormulario(raw: string | null | undefined): Date | null {
  const texto = raw?.trim();
  if (!texto) return null;
  const [anio, mes, dia] = texto.split("-").map(Number);
  return anio && mes && dia ? fechaLocal(anio, mes, dia) : null;
}

// Emite el evento que corresponde al estado al que llegó el caso. El registro
// completo viaja en el evento para que las condiciones puedan mirarlo.
async function emitirPorEstado(id: string, estado: string, session: { id: string; role: string }) {
  const tipo =
    estado === "presentado"
      ? "caso.presentado"
      : estado === "en_revision"
        ? "caso.en_revision"
        : estado === "vencido"
          ? "caso.vencido"
          : null;
  if (!tipo) return;
  const record = await prisma.casoRecurrente.findUnique({
    where: { id },
    include: { company: true, obligacion: true },
  });
  if (!record) return;
  await emitEventAndProcess({
    type: tipo,
    entity: "caso_recurrente",
    entityId: id,
    record: record as unknown as Record<string, unknown>,
    user: session,
  });
}

export async function cambiarEstadoCaso(formData: FormData) {
  const id = formData.get("id") as string;
  const acceso = await casoAccesible(id);
  if (!acceso) return;
  const estado = formData.get("estado") as string;
  if (!esEstadoCaso(estado)) return;

  // Los hitos se sellan solos al alcanzar cada estado: el analista no tiene que
  // acordarse de poner la fecha.
  const ahora = new Date();
  const data: Record<string, unknown> = { estado };
  if (estado === "en_proceso" && !acceso.caso.fechaRecepcionCompleta) {
    data.fechaRecepcionCompleta = ahora;
  }
  if (estado === "presentado") {
    data.fechaPresentacion = acceso.caso.fechaPresentacion ?? ahora;
  }

  await prisma.casoRecurrente.update({ where: { id }, data });
  await emitirPorEstado(id, estado, acceso.session);
  revalidatePath("/casos");
}

// Presentar es el paso que cierra el período y dispara el clonado del siguiente.
export async function presentarCaso(formData: FormData) {
  const id = formData.get("id") as string;
  const acceso = await casoAccesible(id);
  if (!acceso) return;

  const causa = formData.get("causaAtraso") as string;
  await prisma.casoRecurrente.update({
    where: { id },
    data: {
      estado: "presentado",
      fechaPresentacion: fechaDeFormulario(formData.get("fechaPresentacion") as string) ?? new Date(),
      evidenciaUrl: (formData.get("evidenciaUrl") as string)?.trim() || null,
      causaAtraso: esCausaAtraso(causa) ? causa : null,
    },
  });
  await emitirPorEstado(id, "presentado", acceso.session);
  revalidatePath("/casos");
}

export async function actualizarCaso(formData: FormData) {
  const id = formData.get("id") as string;
  const acceso = await casoAccesible(id);
  if (!acceso) return;

  const causa = formData.get("causaAtraso") as string;
  // Reasignar el caso es de gerencia y supervisión, como el resto de la cartera
  const asignacion = canReassign(acceso.session.role)
    ? {
        analistaId: (formData.get("analistaId") as string) || null,
        supervisorId: (formData.get("supervisorId") as string) || null,
      }
    : {};

  await prisma.casoRecurrente.update({
    where: { id },
    data: {
      // La fecha límite se puede corregir a mano: es la salida prevista del
      // motor cuando la obligación es manual o falta el calendario del SENIAT.
      fechaLimite: fechaDeFormulario(formData.get("fechaLimite") as string),
      fechaSolicitudSoportes: fechaDeFormulario(formData.get("fechaSolicitudSoportes") as string),
      causaAtraso: esCausaAtraso(causa) ? causa : null,
      notas: (formData.get("notas") as string)?.trim() || null,
      ...asignacion,
    },
  });
  revalidatePath("/casos");
}

// Abre los casos del período en curso de todos los planes activos. Idempotente:
// el índice único impide duplicar aunque se pulse dos veces.
export async function generarCasos() {
  const session = await getSession();
  if (!session || !canReassign(session.role)) return;
  await generarCasosDelPeriodo();
  revalidatePath("/casos");
}
