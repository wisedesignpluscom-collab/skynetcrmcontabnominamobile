"use server";

// Cobranza (F6). Emitir la factura es del sistema; aquí solo se registra el
// cobro y se corrigen notas. Nada de crear ni borrar cobros a mano: el origen
// de una factura siempre es un plan activo o un servicio entregado.

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canReassign } from "@/lib/permissions";
import { esEstadoPago } from "@/lib/facturacion";
import { emitEventAndProcess } from "@/lib/engine/queue";
import { facturarHonorariosDelPeriodo, marcarFacturasVencidas } from "@/lib/fiscal/facturacion";
import { revalidatePath } from "next/cache";

// La cobranza la llevan gerencia y supervisión: un analista no marca cobros.
async function sesionDeCobranza() {
  const session = await getSession();
  return session && canReassign(session.role) ? session : null;
}

export async function marcarPagada(formData: FormData) {
  const session = await sesionDeCobranza();
  if (!session) return;
  const id = formData.get("id") as string;
  const estado = (formData.get("estadoPago") as string) || "pagado";
  if (!id || !esEstadoPago(estado)) return;

  const factura = await prisma.facturacion.update({
    where: { id },
    data: {
      estadoPago: estado,
      // El cobro sella su fecha; si se revierte, se limpia
      fechaPago: estado === "pagado" ? new Date() : null,
    },
    include: { company: true },
  });

  if (estado === "pagado") {
    await emitEventAndProcess({
      type: "factura.pagada",
      entity: "facturacion",
      entityId: factura.id,
      record: factura as unknown as Record<string, unknown>,
      user: session,
    });
  }
  revalidatePath("/facturacion");
}

export async function guardarNotaFactura(formData: FormData) {
  const session = await sesionDeCobranza();
  if (!session) return;
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.facturacion.update({
    where: { id },
    data: { notas: (formData.get("notas") as string)?.trim() || null },
  });
  revalidatePath("/facturacion");
}

// Corrida manual de la facturación del mes. El barrido del engine ya la hace
// sola; este botón sirve para no esperar al siguiente tick.
export async function correrFacturacion() {
  const session = await sesionDeCobranza();
  if (!session) return;
  const res = await facturarHonorariosDelPeriodo();
  for (const f of res.nuevas) {
    await emitEventAndProcess({
      type: "factura.emitida",
      entity: "facturacion",
      entityId: f.id,
      record: f.record,
      user: session,
    });
  }
  await marcarFacturasVencidas();
  revalidatePath("/facturacion");
}
