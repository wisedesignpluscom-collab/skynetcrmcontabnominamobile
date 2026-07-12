"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAutomations } from "@/lib/permissions";
import { MODULES } from "@/lib/engine/builder";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireAdmin() {
  const session = await getSession();
  if (!session || !canManageAutomations(session.role)) {
    throw new Error("Solo un administrador puede gestionar las plantillas de correo.");
  }
  return session;
}

export type TemplateResult = { ok: boolean; errors: string[]; id?: string };

function parseDraft(formData: FormData) {
  return {
    name: (formData.get("name") as string)?.trim() ?? "",
    description: (formData.get("description") as string)?.trim() ?? "",
    module: (formData.get("module") as string) ?? "contact",
    subject: (formData.get("subject") as string)?.trim() ?? "",
    bodyHtml: (formData.get("bodyHtml") as string) ?? "",
  };
}

function validate(d: ReturnType<typeof parseDraft>): string[] {
  const e: string[] = [];
  if (!d.name) e.push("Ponle un nombre a la plantilla.");
  if (!MODULES[d.module]) e.push("Selecciona un módulo válido.");
  if (!d.subject) e.push("El asunto no puede quedar vacío.");
  if (!d.bodyHtml.replace(/<[^>]*>/g, "").trim()) e.push("El cuerpo del correo está vacío.");
  return e;
}

export async function saveTemplate(
  templateId: string | null,
  formData: FormData
): Promise<TemplateResult> {
  const session = await requireAdmin();
  const draft = parseDraft(formData);
  const errors = validate(draft);
  if (errors.length > 0) return { ok: false, errors };

  if (templateId) {
    const exists = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
    if (!exists) return { ok: false, errors: ["La plantilla ya no existe."] };
    await prisma.emailTemplate.update({
      where: { id: templateId },
      data: {
        name: draft.name,
        description: draft.description || null,
        module: draft.module,
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
      },
    });
    revalidatePath("/plantillas");
    return { ok: true, errors: [], id: templateId };
  }

  const created = await prisma.emailTemplate.create({
    data: {
      name: draft.name,
      description: draft.description || null,
      module: draft.module,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      createdById: session.id,
    },
  });
  revalidatePath("/plantillas");
  return { ok: true, errors: [], id: created.id };
}

export async function deleteTemplate(formData: FormData) {
  await requireAdmin();
  const id = formData.get("templateId") as string;
  if (!id) return;
  await prisma.emailTemplate.delete({ where: { id } });
  revalidatePath("/plantillas");
}

export async function duplicateTemplate(formData: FormData) {
  const session = await requireAdmin();
  const id = formData.get("templateId") as string;
  if (!id) return;
  const t = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!t) return;
  const copy = await prisma.emailTemplate.create({
    data: {
      name: `${t.name} (copia)`,
      description: t.description,
      module: t.module,
      subject: t.subject,
      bodyHtml: t.bodyHtml,
      createdById: session.id,
    },
  });
  revalidatePath("/plantillas");
  redirect(`/plantillas/${copy.id}`);
}
