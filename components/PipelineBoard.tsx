"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { moveDeal, deleteDeal } from "@/app/(crm)/pipeline/actions";

export type BoardDeal = {
  id: string;
  title: string;
  amount: number;
  contactName: string | null;
  companyName: string | null;
  ownerName: string | null;
  pendingAction: string | null;
};

export type BoardStage = {
  id: string;
  name: string;
  color: string;
  type: string;
  deals: BoardDeal[];
};

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function PipelineBoard({
  stages: initial,
  allowDelete = false,
  isApprover = false,
}: {
  stages: BoardStage[];
  allowDelete?: boolean;
  isApprover?: boolean;
}) {
  const [stages, setStages] = useState(initial);
  const router = useRouter();

  async function onDelete(dealId: string) {
    if (!confirm("¿Eliminar esta oportunidad? Esta acción no se puede deshacer.")) return;
    setStages((prev) =>
      prev.map((s) => ({ ...s, deals: s.deals.filter((d) => d.id !== dealId) }))
    );
    await deleteDeal(dealId);
    router.refresh();
  }

  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index)
      return;

    const destStage = stages.find((s) => s.id === destination.droppableId);

    // Soltar en "Perdido" siempre pide el motivo
    let reason: string | undefined;
    if (destStage?.type === "lost") {
      const input = prompt(
        isApprover
          ? "Motivo de la pérdida:"
          : "Motivo de la pérdida (tu solicitud irá al supervisor para aprobación):"
      );
      if (!input?.trim()) return; // cancelado: la tarjeta no se mueve
      reason = input.trim();
    }

    // Si es una solicitud (vendedor → Perdido), la tarjeta no se mueve aún
    const isRequest = destStage?.type === "lost" && !isApprover;

    if (!isRequest) {
      // Actualización optimista: mover la tarjeta en pantalla de inmediato
      setStages((prev) => {
        const next = prev.map((s) => ({ ...s, deals: [...s.deals] }));
        const from = next.find((s) => s.id === source.droppableId)!;
        const to = next.find((s) => s.id === destination.droppableId)!;
        const [moved] = from.deals.splice(source.index, 1);
        to.deals.splice(destination.index, 0, moved);
        return next;
      });
    }

    const result2 = await moveDeal(draggableId, destination.droppableId, reason);
    if (result2 === "pending") {
      alert("Solicitud enviada ✔ — el supervisor debe aprobar la pérdida.");
    }
    router.refresh();
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const total = stage.deals.reduce((s, d) => s + d.amount, 0);
          return (
            <div key={stage.id} className="w-64 shrink-0">
              {/* Cabecera de columna */}
              <div
                className="rounded-t-xl border-b-4 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200"
                style={{ borderBottomColor: stage.color }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{stage.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {stage.deals.length}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{money.format(total)}</p>
              </div>

              {/* Zona de tarjetas */}
              <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-[420px] space-y-2 rounded-b-xl p-2 transition-colors ${
                      snapshot.isDraggingOver ? "bg-teal-50" : "bg-slate-50"
                    }`}
                  >
                    {stage.deals.map((deal, index) => (
                      <Draggable key={deal.id} draggableId={deal.id} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow ${
                              dragSnapshot.isDragging ? "rotate-1 shadow-lg ring-2 ring-teal-400" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <Link
                                href={`/pipeline/${deal.id}`}
                                className="text-sm font-medium leading-snug text-slate-800 hover:text-teal-700 hover:underline"
                              >
                                {deal.title}
                              </Link>
                              {allowDelete && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(deal.id);
                                  }}
                                  title="Eliminar oportunidad"
                                  className="shrink-0 rounded p-0.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            {(deal.contactName || deal.companyName) && (
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {deal.contactName}
                                {deal.contactName && deal.companyName && " · "}
                                {deal.companyName}
                              </p>
                            )}
                            {deal.pendingAction && (
                              <span className="mt-1.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                ⏳ {deal.pendingAction === "discount" ? "Descuento" : "Pérdida"}{" "}
                                pendiente de aprobación
                              </span>
                            )}
                            <div className="mt-2 flex items-center justify-between">
                              <p className="text-sm font-semibold text-teal-700">
                                {money.format(deal.amount)}
                              </p>
                              {deal.ownerName && (
                                <span
                                  title={`Vendedor: ${deal.ownerName}`}
                                  className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600"
                                >
                                  {deal.ownerName[0]?.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
