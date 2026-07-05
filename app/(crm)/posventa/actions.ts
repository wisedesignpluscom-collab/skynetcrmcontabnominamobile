"use server";

import { prisma } from "@/lib/prisma";
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

  revalidatePath("/posventa");
  revalidatePath("/");
}
