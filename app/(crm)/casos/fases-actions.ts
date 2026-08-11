"use server";

// Evidencia estructurada de las sub-fases de un caso (Etapa 3 «Mis
// Consultores»): cada fase se completa con campos de resultado reales, nunca
// un simple "¿lo hiciste? Sí/No" — ver lib/casos-fases.ts.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { recurringCaseScope } from "@/lib/permissions";
import { parseCamposEvidencia, validarEvidenciaFase } from "@/lib/casos-fases";
import { validarEspecial } from "@/lib/fiscal/faseValidaciones";
import { revalidatePath } from "next/cache";

export async function guardarEvidenciaFase(
  _prev: { errors?: string[] } | undefined,
  formData: FormData
): Promise<{ errors?: string[] } | undefined> {
  const session = await getSession();
  if (!session) return { errors: ["Sesión inválida."] };

  const casoFaseId = formData.get("casoFaseId") as string;
  if (!casoFaseId) return { errors: ["Falta identificar la fase."] };

  const casoFase = await prisma.casoFase.findFirst({
    where: { id: casoFaseId, caso: recurringCaseScope(session) },
    include: { caso: { select: { id: true, companyId: true } }, obligacionFase: true },
  });
  if (!casoFase) return { errors: ["No tienes acceso a esta fase."] };

  const campos = parseCamposEvidencia(casoFase.obligacionFase.campos);
  const datos: Record<string, string> = {};
  for (const campo of campos) {
    datos[campo.clave] = ((formData.get(`campo_${campo.clave}`) as string) ?? "").trim();
  }

  const errores = validarEvidenciaFase(campos, datos);
  if (errores.length === 0) {
    const especiales = await validarEspecial(casoFase.obligacionFase.validacionEspecial, {
      companyId: casoFase.caso.companyId,
      casoId: casoFase.caso.id,
      obligacionFaseId: casoFase.obligacionFaseId,
      campos,
      datos,
    });
    errores.push(...especiales);
  }
  if (errores.length > 0) return { errors: errores };

  await prisma.casoFase.update({
    where: { id: casoFaseId },
    data: {
      estado: "completada",
      datos: JSON.stringify(datos),
      completadaPorId: session.id,
      completadaAt: new Date(),
    },
  });
  revalidatePath("/casos");
}

// Reabrir una fase ya completada (el analista se equivocó, o hay que corregir
// un dato) — vuelve a "pendiente" y borra la firma de quién/cuándo, para que
// quede claro que hay que completarla de nuevo.
export async function reabrirFase(formData: FormData) {
  const session = await getSession();
  if (!session) return;
  const casoFaseId = formData.get("casoFaseId") as string;
  if (!casoFaseId) return;

  const casoFase = await prisma.casoFase.findFirst({
    where: { id: casoFaseId, caso: recurringCaseScope(session) },
  });
  if (!casoFase) return;

  await prisma.casoFase.update({
    where: { id: casoFaseId },
    data: { estado: "pendiente", completadaPorId: null, completadaAt: null },
  });
  revalidatePath("/casos");
}
