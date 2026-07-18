"use client";

// Calendario de tareas y llamadas: vistas Mes / Semana / Día con hora. Sin
// dependencias: la cuadrícula y la agenda por horas se dibujan con CSS. Los
// eventos son Task (llamada, reunión, email, seguimiento…) coloreados por tipo.

import { useMemo, useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createCalendarTask,
  updateCalendarTask,
  toggleCalendarTask,
  deleteCalendarTask,
} from "@/app/(crm)/calendario/actions";

export type CalEvent = {
  id: string;
  title: string;
  type: string;
  dueDate: string; // ISO
  hasTime: boolean;
  durationMin: number | null;
  done: boolean;
  ownerId: string | null;
  ownerName: string | null;
  contactId: string | null;
  contactName: string | null;
};

type Option = { id: string; name: string };
type View = "mes" | "semana" | "dia";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

const DAY_START = 7; // 7:00
const DAY_END = 21; // 21:00
const HOUR_PX = 44;

// ── Color por tipo (robusto a etiquetas o códigos) ──────────────────────────
function typeStyle(type: string): { dot: string; chip: string; bar: string } {
  const t = type.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (t.includes("llam")) return { dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 border-sky-200", bar: "border-l-sky-500" };
  if (t.includes("reun")) return { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 border-violet-200", bar: "border-l-violet-500" };
  if (t.includes("email") || t.includes("correo")) return { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200", bar: "border-l-amber-500" };
  if (t.includes("segui")) return { dot: "bg-teal-500", chip: "bg-teal-50 text-teal-700 border-teal-200", bar: "border-l-teal-500" };
  return { dot: "bg-slate-400", chip: "bg-slate-50 text-slate-600 border-slate-200", bar: "border-l-slate-400" };
}

// ── Utilidades de fecha (sin dependencias) ──────────────────────────────────
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
// Lunes como primer día
function startOfWeek(d: Date) { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); }
function toDateInput(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function toTimeInput(d: Date) { return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function hhmm(d: Date) { return d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }); }

// ── Modal de creación / edición ─────────────────────────────────────────────
function EventModal({
  event,
  defaultDate,
  defaultTime,
  users,
  contacts,
  taskTypes,
  canSeeAll,
  currentUserId,
  onClose,
}: {
  event: CalEvent | null;
  defaultDate: string;
  defaultTime: string;
  users: Option[];
  contacts: Option[];
  taskTypes: string[];
  canSeeAll: boolean;
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = !!event;
  const d = event ? new Date(event.dueDate) : null;

  const [title, setTitle] = useState(event?.title ?? "");
  const [type, setType] = useState(event?.type ?? taskTypes[0] ?? "Seguimiento");
  const [date, setDate] = useState(d ? toDateInput(d) : defaultDate);
  const [allDay, setAllDay] = useState(event ? !event.hasTime : false);
  const [time, setTime] = useState(d && event?.hasTime ? toTimeInput(d) : defaultTime || "09:00");
  const [durationMin, setDurationMin] = useState(String(event?.durationMin ?? 30));
  // El vendedor (no canSeeAll) siempre es el responsable; no puede reasignar
  const [ownerId, setOwnerId] = useState(
    canSeeAll ? event?.ownerId ?? "" : event?.ownerId ?? currentUserId
  );
  const [contactId, setContactId] = useState(event?.contactId ?? "");
  const [saving, start] = useTransition();

  function submit() {
    if (!title.trim()) return;
    const fd = new FormData();
    if (isEdit) fd.set("taskId", event!.id);
    fd.set("title", title);
    fd.set("type", type);
    fd.set("date", date);
    fd.set("allDay", allDay ? "true" : "false");
    fd.set("time", time);
    fd.set("durationMin", durationMin);
    fd.set("ownerId", ownerId);
    fd.set("contactId", contactId);
    start(async () => {
      if (isEdit) await updateCalendarTask(fd);
      else await createCalendarTask(fd);
      router.refresh();
      onClose();
    });
  }

  function complete() {
    const fd = new FormData();
    fd.set("taskId", event!.id);
    start(async () => { await toggleCalendarTask(fd); router.refresh(); onClose(); });
  }
  function remove() {
    if (!confirm("¿Eliminar esta tarea?")) return;
    const fd = new FormData();
    fd.set("taskId", event!.id);
    start(async () => { await deleteCalendarTask(fd); router.refresh(); onClose(); });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-bold text-slate-900">{isEdit ? "Editar tarea" : "Nueva tarea"}</h2>
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="¿Qué hay que hacer? (ej. Llamar a…)" className={`${inputClass} w-full`} autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-600">
              <span className="mb-1 block font-medium">Tipo</span>
              <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} w-full`}>
                {taskTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-600">
              <span className="mb-1 block font-medium">Fecha</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} w-full`} />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4" />
              Todo el día
            </label>
            {!allDay && (
              <>
                <label className="block text-xs text-slate-600">
                  <span className="mb-1 block font-medium">Hora</span>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${inputClass} w-28`} />
                </label>
                <label className="block text-xs text-slate-600">
                  <span className="mb-1 block font-medium">Duración (min)</span>
                  <input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} className={`${inputClass} w-24`} />
                </label>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-600">
              <span className="mb-1 block font-medium">Responsable</span>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                disabled={!canSeeAll}
                title={!canSeeAll ? "Solo un supervisor o admin puede reasignar" : undefined}
                className={`${inputClass} w-full ${!canSeeAll ? "cursor-not-allowed bg-slate-50 text-slate-500" : ""}`}
              >
                {canSeeAll && <option value="">— Sin asignar —</option>}
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-600">
              <span className="mb-1 block font-medium">Contacto</span>
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={`${inputClass} w-full`}>
                <option value="">— Ninguno —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancelar</button>
          </div>
          {isEdit && (
            <div className="flex gap-2">
              <button type="button" onClick={complete} disabled={saving} className={`rounded-lg px-3 py-2 text-sm font-semibold ${event!.done ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                {event!.done ? "✓ Hecha (reabrir)" : "✓ Completar"}
              </button>
              <button type="button" onClick={remove} disabled={saving} className="rounded-lg px-2 py-2 text-sm font-semibold text-red-400 hover:bg-red-50">✕</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Calendario ───────────────────────────────────────────────────────────────
export default function CalendarView({
  events,
  users,
  contacts,
  taskTypes,
  canSeeAll,
  currentUserId,
}: {
  events: CalEvent[];
  users: Option[];
  contacts: Option[];
  taskTypes: string[];
  canSeeAll: boolean;
  currentUserId: string;
}) {
  const [view, setView] = useState<View>("mes");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [owner, setOwner] = useState<string>(canSeeAll ? "todos" : currentUserId);
  const [modal, setModal] = useState<{ event: CalEvent | null; date: string; time: string } | null>(null);

  const filtered = useMemo(
    () => events.filter((e) => owner === "todos" || e.ownerId === owner),
    [events, owner]
  );

  // Índice por día (YYYY-MM-DD)
  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of filtered) {
      const key = toDateInput(new Date(e.dueDate));
      const arr = m.get(key) ?? [];
      arr.push(e);
      m.set(key, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
    return m;
  }, [filtered]);

  function shift(dir: -1 | 1) {
    if (view === "mes") setCursor((c) => { const x = new Date(c); x.setMonth(x.getMonth() + dir); return x; });
    else if (view === "semana") setCursor((c) => addDays(c, dir * 7));
    else setCursor((c) => addDays(c, dir));
  }

  const title =
    view === "mes"
      ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
      : view === "dia"
        ? cursor.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" })
        : (() => { const s = startOfWeek(cursor); const e = addDays(s, 6); return `${s.getDate()} ${MONTHS[s.getMonth()].slice(0, 3)} – ${e.getDate()} ${MONTHS[e.getMonth()].slice(0, 3)}`; })();

  return (
    <div className="space-y-4">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100">‹</button>
          <button onClick={() => setCursor(startOfDay(new Date()))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Hoy</button>
          <button onClick={() => shift(1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100">›</button>
          <h2 className="ml-2 text-lg font-bold capitalize text-slate-900">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {canSeeAll && (
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className={`${inputClass} py-1.5 text-xs`}>
              <option value="todos">Todos</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {(["mes", "semana", "dia"] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors ${view === v ? "bg-teal-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setModal({ event: null, date: toDateInput(cursor), time: "09:00" })}
            className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
          >
            + Tarea
          </button>
        </div>
      </div>

      {view === "mes" && <MonthGrid cursor={cursor} byDay={byDay} onDay={(d) => setModal({ event: null, date: d, time: "09:00" })} onEvent={(e) => setModal({ event: e, date: "", time: "" })} />}
      {view === "semana" && <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))} byDay={byDay} onSlot={(d, t) => setModal({ event: null, date: d, time: t })} onEvent={(e) => setModal({ event: e, date: "", time: "" })} />}
      {view === "dia" && <TimeGrid days={[cursor]} byDay={byDay} onSlot={(d, t) => setModal({ event: null, date: d, time: t })} onEvent={(e) => setModal({ event: e, date: "", time: "" })} />}

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
        {["Llamada", "Reunión", "Email", "Seguimiento"].map((t) => (
          <span key={t} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-full ${typeStyle(t).dot}`} />{t}</span>
        ))}
      </div>

      {modal && (
        <EventModal
          event={modal.event}
          defaultDate={modal.date}
          defaultTime={modal.time}
          users={users}
          contacts={contacts}
          taskTypes={taskTypes}
          canSeeAll={canSeeAll}
          currentUserId={currentUserId}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Vista Mes ────────────────────────────────────────────────────────────────
function MonthGrid({ cursor, byDay, onDay, onEvent }: { cursor: Date; byDay: Map<string, CalEvent[]>; onDay: (d: string) => void; onEvent: (e: CalEvent) => void }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const today = new Date();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {DOW.map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const key = toDateInput(day);
          const evs = byDay.get(key) ?? [];
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = sameDay(day, today);
          return (
            <div
              key={i}
              onClick={() => onDay(key)}
              className={`min-h-24 cursor-pointer border-b border-r border-slate-100 p-1.5 transition-colors hover:bg-slate-50 ${inMonth ? "" : "bg-slate-50/50"}`}
            >
              <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-teal-600 text-white" : inMonth ? "text-slate-700" : "text-slate-300"}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {evs.slice(0, 3).map((e) => {
                  const st = typeStyle(e.type);
                  const dt = new Date(e.dueDate);
                  return (
                    <button
                      key={e.id}
                      onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}
                      className={`flex w-full items-center gap-1 truncate rounded border px-1 py-0.5 text-left text-[10px] ${st.chip} ${e.done ? "opacity-50 line-through" : ""}`}
                    >
                      {e.hasTime && <span className="font-semibold">{hhmm(dt)}</span>}
                      <span className="truncate">{e.title}</span>
                    </button>
                  );
                })}
                {evs.length > 3 && <p className="pl-1 text-[10px] text-slate-400">+{evs.length - 3} más</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Vista Semana / Día (agenda por horas) ────────────────────────────────────
function TimeGrid({ days, byDay, onSlot, onEvent }: { days: Date[]; byDay: Map<string, CalEvent[]>; onSlot: (d: string, t: string) => void; onEvent: (e: CalEvent) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  const today = new Date();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (9 - DAY_START) * HOUR_PX - 20);
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Cabecera de días */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        <div className="w-14 shrink-0" />
        {days.map((d, i) => {
          const isToday = sameDay(d, today);
          const allDayEvs = (byDay.get(toDateInput(d)) ?? []).filter((e) => !e.hasTime);
          return (
            <div key={i} className="flex-1 border-l border-slate-100 px-1 py-1.5 text-center">
              <p className="text-[11px] font-semibold uppercase text-slate-400">{DOW[i % 7]}</p>
              <p className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isToday ? "bg-teal-600 text-white" : "text-slate-700"}`}>{d.getDate()}</p>
              {/* Tareas de todo el día */}
              {allDayEvs.map((e) => {
                const st = typeStyle(e.type);
                return (
                  <button key={e.id} onClick={() => onEvent(e)} className={`mt-0.5 block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] ${st.chip} ${e.done ? "opacity-50 line-through" : ""}`}>
                    {e.title}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Rejilla de horas */}
      <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
        <div className="flex">
          {/* Gutter de horas */}
          <div className="w-14 shrink-0">
            {hours.map((h) => (
              <div key={h} className="relative border-b border-slate-100 text-right" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-1 text-[10px] text-slate-400">{h}:00</span>
              </div>
            ))}
          </div>
          {/* Columnas de días */}
          {days.map((d, i) => {
            const key = toDateInput(d);
            const timed = (byDay.get(key) ?? []).filter((e) => e.hasTime);
            return (
              <div key={i} className="relative flex-1 border-l border-slate-100">
                {hours.map((h) => (
                  <div
                    key={h}
                    onClick={() => onSlot(key, `${String(h).padStart(2, "0")}:00`)}
                    className="cursor-pointer border-b border-slate-100 hover:bg-teal-50/40"
                    style={{ height: HOUR_PX }}
                  />
                ))}
                {timed.map((e) => {
                  const dt = new Date(e.dueDate);
                  const top = (dt.getHours() + dt.getMinutes() / 60 - DAY_START) * HOUR_PX;
                  const height = Math.max(22, ((e.durationMin ?? 30) / 60) * HOUR_PX);
                  if (top < -HOUR_PX) return null;
                  const st = typeStyle(e.type);
                  return (
                    <button
                      key={e.id}
                      onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}
                      className={`absolute left-0.5 right-0.5 overflow-hidden rounded border border-l-4 px-1 py-0.5 text-left text-[10px] shadow-sm ${st.chip} ${st.bar} ${e.done ? "opacity-50 line-through" : ""}`}
                      style={{ top, height }}
                    >
                      <span className="block font-semibold">{hhmm(dt)}</span>
                      <span className="block truncate">{e.title}</span>
                      {e.contactName && <span className="block truncate text-slate-400">{e.contactName}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
