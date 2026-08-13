"use server";

// Checklist de fases de un caso (obligación → analista, paso a paso). El
// bloqueo es real, no solo de la UI: el servidor rechaza completar una fase
// si la anterior no está completada, y solo supervisor/admin puede reabrir
// (lo que descompleta también las fases posteriores, para no dejar una
// "completada" que dependía de otra que se deshizo).

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canDelete, recurringCaseScope } from "@/lib/permissions";
import { ensamblarFases, parseCampos, serializeValores, validarValoresFase } from "@/lib/fases";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function casoAccesible(id: string) {
  const session = await getSession();
  if (!session || !id) return null;
  const caso = await prisma.casoRecurrente.findFirst({
    where: { id, ...recurringCaseScope(session) },
  });
  return caso ? { session, caso } : null;
}

function irConError(mensaje: string): never {
  redirect(`/casos?faseError=${encodeURIComponent(mensaje)}`);
}

export async function completarFase(formData: FormData) {
  const casoId = formData.get("casoId") as string;
  const faseId = formData.get("faseId") as string;
  const acceso = await casoAccesible(casoId);
  if (!acceso || !faseId) return;

  const [fases, progresos] = await Promise.all([
    prisma.faseObligacion.findMany({
      where: { obligacionId: acceso.caso.obligacionId },
      orderBy: { order: "asc" },
    }),
    prisma.casoFaseProgreso.findMany({ where: { casoId } }),
  ]);
  const completadas = new Set(progresos.map((p) => p.faseObligacionId));
  const activa = fases.find((f) => !completadas.has(f.id));

  // No se puede completar una fase que no es la siguiente pendiente: ni
  // saltar hacia adelante ni volver a completar una ya hecha.
  if (!activa || activa.id !== faseId) {
    irConError("No puedes completar esta fase todavía: hay pasos anteriores sin terminar.");
  }

  const campos = parseCampos(activa.campos);
  const valores: Record<string, string> = {};
  for (const campo of campos) valores[campo.id] = ((formData.get(`campo_${campo.id}`) as string) ?? "").trim();

  const errores = validarValoresFase(campos, valores);
  if (Object.keys(errores).length > 0) {
    irConError("Faltan datos obligatorios de esta fase.");
  }

  await prisma.casoFaseProgreso.create({
    data: {
      casoId,
      faseObligacionId: activa.id,
      completedById: acceso.session.id,
      valores: serializeValores(valores),
    },
  });
  revalidatePath("/casos");
}

export async function reabrirFase(formData: FormData) {
  const casoId = formData.get("casoId") as string;
  const faseId = formData.get("faseId") as string;
  const acceso = await casoAccesible(casoId);
  if (!acceso || !faseId || !canDelete(acceso.session.role)) return;

  const [fase, fases] = await Promise.all([
    prisma.faseObligacion.findUnique({ where: { id: faseId } }),
    prisma.faseObligacion.findMany({
      where: { obligacionId: acceso.caso.obligacionId },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    }),
  ]);
  if (!fase) return;

  // Reabrir borra esta fase y todas las que venían después (mismo orden que
  // la plantilla): una fase "completada" no puede depender de un paso deshecho.
  const idsPosteriores = fases.filter((f) => f.order >= fase.order).map((f) => f.id);
  await prisma.casoFaseProgreso.deleteMany({
    where: { casoId, faseObligacionId: { in: idsPosteriores } },
  });
  revalidatePath("/casos");
}

// Datos ya ensamblados para la timeline del componente cliente-cero (CasoRow).
export async function fasesDelCaso(casoId: string, obligacionId: string) {
  const [fases, progresos] = await Promise.all([
    prisma.faseObligacion.findMany({ where: { obligacionId }, orderBy: { order: "asc" } }),
    prisma.casoFaseProgreso.findMany({
      where: { casoId },
      include: { completedBy: { select: { name: true } } },
    }),
  ]);
  return ensamblarFases(fases, progresos);
}
