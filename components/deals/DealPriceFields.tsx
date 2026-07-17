"use client";

// Campos de Servicio + Valor de la oportunidad. Si el precio está bloqueado
// (regla del negocio), el valor lo define el servicio y el campo va de solo
// lectura; si no, el valor es editable.

import { useState } from "react";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

export type ServiceOpt = { id: string; name: string; price: number };

export default function DealPriceFields({
  services,
  lockPrice,
  initialServiceId = "",
  initialAmount = "",
}: {
  services: ServiceOpt[];
  lockPrice: boolean;
  initialServiceId?: string;
  initialAmount?: string;
}) {
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [amount, setAmount] = useState(initialAmount);
  const selected = services.find((s) => s.id === serviceId);
  const lockedAmount = selected ? String(selected.price) : "";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Servicio</label>
        <select
          name="serviceId"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className={inputClass}
        >
          <option value="">Sin servicio</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — ${s.price.toLocaleString("en-US")}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Valor estimado (USD)
        </label>
        {lockPrice ? (
          <>
            <input
              value={lockedAmount}
              readOnly
              disabled
              className={`${inputClass} bg-slate-100 text-slate-500`}
              placeholder="Se toma del servicio"
            />
            <input type="hidden" name="amount" value={lockedAmount} />
            <p className="mt-1 text-xs text-slate-400">
              El precio lo define el servicio. Para un descuento, solicítalo al supervisor.
            </p>
          </>
        ) : (
          <input
            name="amount"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
            placeholder="2500"
          />
        )}
      </div>
    </div>
  );
}
