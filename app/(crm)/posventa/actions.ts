"use server";

import { prisma } from "@/lib/prisma";
import { onFollowUpSaved } from "@/lib/automations";
import { emitEventAndProcess } from "@/lib/engine/queue";
import { revalidatePath } from "next/cache";

export async function updateFollowUp(formData: FormData) {
  const id = formData.get("followUpId") as string;
  if (!id) return;

  const followUp = await prisma.followUp.findUnique({ where: { id } });
  if (!followUp) return;

  const rawDate = formData.get("nextContactDate") as string;
  const rawSatisfaction = formData.get("satisfaction") as string;
  const note = (formData.get("note") as string)?.trim();

  await prisma.followUp.update({
    where: { id },
    data: {
      stage: (formData.get("stage") as string) || followUp.stage,
      nextContactDate: rawDate ? new Date(`${rawDate}T12:00:00`) : null,
      satisfaction: rawSatisfaction ? Number(rawSatisfaction) : null,
    },
  });

  // Cada contacto de posventa queda en el historial del cliente
  if (note) {
    await prisma.activity.create({
      data: {
        type: "nota",
        content: `Posventa: ${note}`,
        contactId: followUp.contactId,
        dealId: followUp.dealId,
      },
    });
  }

  // Reglas de automatización: riesgo automático y posventa recurrente
  await onFollowUpSaved(id, { hadNote: !!note, dateProvided: !!rawDate });

  // Workflow Engine: con el estado final (las reglas v1 pueden cambiar la etapa)
  const saved = await prisma.followUp.findUnique({
    where: { id },
    include: { contact: true, deal: true },
  });
  if (saved) {
    await emitEventAndProcess({
      type: "followup.saved",
      entity: "followup",
      entityId: id,
      record: saved,
    });
  }

  revalidatePath("/posventa");
  revalidatePath("/");
  revalidatePath("/tareas");
}
