"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  addDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Check,
  Flame,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import clsx from "clsx";

import { useUserData } from "@/lib/data/UserDataProvider";
import { routinePath, routinesPath } from "@/lib/db/paths";
import type { RoutineDoc } from "@/lib/db/types";
import {
  DOW_LABELS,
  DOW_PRESETS,
  addDaysIso,
  buildHeatmap,
  computeBestStreak,
  computeStreak,
  dowOfIso,
  formatSchedule,
} from "@/lib/routines/helpers";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";

type Row = { id: string; data: RoutineDoc };

const BACKFILL_DAYS = 3;

export default function RoutinesTab() {
  const { uid, effectiveProfile } = useUserData();
  const tz = effectiveProfile?.timezone ?? "UTC";
  const today = useMemo(
    () => computeLocalDate(new Date(), tz),
    [tz],
  );
  const todayDow = useMemo(() => dowOfIso(today), [today]);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // -- Add form state --------------------------------------------------------
  const [name, setName] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>(DOW_PRESETS.daily);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const q = query(routinesPath(uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
        setError(null);
      },
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [uid]);

  const toggleWeekday = (d: number) => {
    setWeekdays((curr) =>
      curr.includes(d) ? curr.filter((x) => x !== d) : [...curr, d].sort(),
    );
  };

  const handleAdd = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed || !uid || adding || weekdays.length === 0) return;
      setAdding(true);
      try {
        await addDoc(routinesPath(uid), {
          name: trimmed,
          weekdays: [...weekdays].sort(),
          active: true,
          done: {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as unknown as RoutineDoc);
        setName("");
        setWeekdays(DOW_PRESETS.daily);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add routine");
      } finally {
        setAdding(false);
      }
    },
    [name, weekdays, uid, adding],
  );

  return (
    <section className="space-y-4">
      <form
        onSubmit={handleAdd}
        className="space-y-3 rounded-xl border border-border bg-neutral-900/40 p-3"
      >
        <div className="flex items-center gap-2">
          <Plus aria-hidden className="h-5 w-5 shrink-0 text-accent" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New routine — e.g. Drink 2L water, Meditate"
            maxLength={200}
            className="h-10 flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-muted focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding || !name.trim() || weekdays.length === 0}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-neutral-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DayPicker
            value={weekdays}
            onChange={setWeekdays}
            highlightToday={todayDow}
          />
          <div className="ml-auto flex gap-1.5">
            <PresetButton
              label="Daily"
              active={weekdays.length === 7}
              onClick={() => setWeekdays([...DOW_PRESETS.daily])}
            />
            <PresetButton
              label="Weekdays"
              active={
                weekdays.length === 5 &&
                [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))
              }
              onClick={() => setWeekdays([...DOW_PRESETS.weekdays])}
            />
            <PresetButton
              label="Weekends"
              active={
                weekdays.length === 2 &&
                weekdays.includes(0) &&
                weekdays.includes(6)
              }
              onClick={() => setWeekdays([...DOW_PRESETS.weekends])}
            />
          </div>
        </div>
      </form>

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      {rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-neutral-900/30 px-4 py-10 text-center">
          <p className="text-sm font-medium text-neutral-100">
            No routines yet.
          </p>
          <p className="mt-1 text-xs text-muted">
            Routines are habits you commit to on specific days. Try
            &quot;Drink 2L water&quot; (Daily) or &quot;Gym&quot; (Mon · Wed · Fri).
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <RoutineCard
              key={row.id}
              uid={uid!}
              row={row}
              today={today}
              todayDow={todayDow}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Day picker — 7 pill toggles
// ---------------------------------------------------------------------------

interface DayPickerProps {
  value: number[];
  onChange: (next: number[]) => void;
  highlightToday?: number;
  size?: "sm" | "md";
}

export function DayPicker({
  value,
  onChange,
  highlightToday,
  size = "md",
}: DayPickerProps) {
  const selected = new Set(value);
  const toggle = (d: number) => {
    onChange(
      selected.has(d) ? value.filter((x) => x !== d) : [...value, d].sort(),
    );
  };
  return (
    <div role="group" aria-label="Weekdays" className="flex gap-1">
      {DOW_LABELS.map((label, idx) => {
        const isSelected = selected.has(idx);
        const isToday = highlightToday === idx;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => toggle(idx)}
            aria-pressed={isSelected}
            className={clsx(
              size === "sm"
                ? "h-7 w-7 text-[10px]"
                : "h-8 w-8 text-[11px]",
              "rounded-md font-semibold transition-colors",
              isSelected
                ? "bg-accent text-neutral-900"
                : "border border-border bg-neutral-900 text-muted hover:text-neutral-200",
              !isSelected && isToday && "ring-1 ring-accent/40",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "h-8 rounded-md border px-2 text-[10px] font-medium uppercase tracking-wide transition-colors",
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border bg-neutral-900 text-muted hover:text-neutral-200",
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Routine card
// ---------------------------------------------------------------------------

interface RoutineCardProps {
  uid: string;
  row: Row;
  today: string;
  todayDow: number;
  onError: (msg: string) => void;
}

function RoutineCard({
  uid,
  row,
  today,
  todayDow,
  onError,
}: RoutineCardProps) {
  const { id, data } = row;
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(data.name);
  const [draftDays, setDraftDays] = useState<number[]>(data.weekdays);
  const [saving, setSaving] = useState(false);

  const scheduleSet = useMemo(() => new Set(data.weekdays), [data.weekdays]);
  const scheduledToday = scheduleSet.has(todayDow);
  const doneToday = Boolean(data.done?.[today]);

  const streak = useMemo(
    () => computeStreak(data, today),
    [data, today],
  );
  const best = useMemo(() => computeBestStreak(data), [data]);
  const heatmap = useMemo(
    () => buildHeatmap(data, today, 28),
    [data, today],
  );

  const toggleDay = useCallback(
    async (date: string) => {
      // Backfill window: allow today and the prior BACKFILL_DAYS days only.
      const cutoff = addDaysIso(today, -BACKFILL_DAYS);
      if (date > today || date < cutoff) return;
      try {
        const next = { ...(data.done ?? {}) };
        if (next[date]) {
          delete next[date];
        } else {
          next[date] = true;
        }
        await updateDoc(routinePath(uid, id), {
          done: next,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to update");
      }
    },
    [uid, id, data.done, today, onError],
  );

  const setActive = useCallback(
    async (next: boolean) => {
      try {
        await updateDoc(routinePath(uid, id), {
          active: next,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to update");
      }
    },
    [uid, id, onError],
  );

  const remove = useCallback(async () => {
    if (!confirm(`Delete "${data.name}"? This can't be undone.`)) return;
    try {
      await deleteDoc(routinePath(uid, id));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete");
    }
  }, [uid, id, data.name, onError]);

  const saveEdit = useCallback(async () => {
    const trimmed = draftName.trim();
    if (!trimmed || draftDays.length === 0) return;
    setSaving(true);
    try {
      await updateDoc(routinePath(uid, id), {
        name: trimmed,
        weekdays: [...draftDays].sort(),
        updatedAt: serverTimestamp(),
      });
      setEditing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [uid, id, draftName, draftDays, onError]);

  return (
    <li
      className={clsx(
        "rounded-xl border bg-neutral-900/40 p-4 transition-opacity",
        data.active
          ? "border-border"
          : "border-border/60 opacity-60",
      )}
    >
      {editing ? (
        <div className="space-y-3">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={200}
            autoFocus
            className="h-10 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
          />
          <DayPicker value={draftDays} onChange={setDraftDays} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraftName(data.name);
                setDraftDays(data.weekdays);
              }}
              className="h-8 rounded-md border border-border bg-neutral-900 px-3 text-xs text-muted hover:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving || !draftName.trim() || draftDays.length === 0}
              className="h-8 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => toggleDay(today)}
              disabled={!scheduledToday || !data.active}
              aria-pressed={doneToday}
              aria-label={
                !scheduledToday
                  ? "Not scheduled today"
                  : doneToday
                    ? "Mark today not done"
                    : "Mark today done"
              }
              className={clsx(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition",
                !scheduledToday || !data.active
                  ? "cursor-not-allowed border-border bg-neutral-900/40 text-muted"
                  : doneToday
                    ? "border-cyan-400 bg-cyan-400 text-neutral-900 shadow-[0_0_24px_-6px_rgba(34,211,238,0.6)]"
                    : "border-cyan-400/40 bg-transparent text-cyan-300 hover:border-cyan-400 hover:bg-cyan-400/10",
              )}
            >
              {doneToday ? (
                <Check className="h-5 w-5" strokeWidth={3} />
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wide">
                  {scheduledToday ? "Today" : "—"}
                </span>
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-neutral-100">
                  {data.name}
                </h3>
                <div className="flex shrink-0 items-center gap-1">
                  <IconBtn
                    label={data.active ? "Pause" : "Resume"}
                    onClick={() => setActive(!data.active)}
                    Icon={data.active ? Pause : Play}
                  />
                  <IconBtn
                    label="Edit"
                    onClick={() => setEditing(true)}
                    Icon={Pencil}
                  />
                  <IconBtn label="Delete" onClick={remove} Icon={Trash2} danger />
                </div>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                {formatSchedule(data.weekdays)}
              </p>
              <div className="mt-2 flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1">
                  <Flame
                    className={clsx(
                      "h-3.5 w-3.5",
                      streak >= 3 ? "text-amber-400" : "text-muted",
                    )}
                  />
                  <span className="font-semibold text-neutral-100 tabular-nums">
                    {streak}
                  </span>
                  <span className="text-muted">streak</span>
                </span>
                <span className="text-muted">·</span>
                <span className="inline-flex items-center gap-1">
                  <span className="font-medium text-neutral-300 tabular-nums">
                    {best}
                  </span>
                  <span className="text-muted">best</span>
                </span>
              </div>
            </div>
          </div>

          {/* 28-day heatmap */}
          <div className="mt-3 flex gap-[3px] overflow-hidden">
            {heatmap.map((cell) => {
              const tone =
                !cell.scheduled
                  ? "bg-neutral-800/40"
                  : cell.done
                    ? "bg-cyan-400"
                    : cell.date < today
                      ? "bg-red-500/40"
                      : "bg-cyan-400/10 border border-cyan-400/30";
              const editable =
                cell.scheduled &&
                data.active &&
                cell.date >= addDaysIso(today, -BACKFILL_DAYS) &&
                cell.date <= today;
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => toggleDay(cell.date)}
                  disabled={!editable}
                  title={`${cell.date}${cell.scheduled ? (cell.done ? " · done" : " · scheduled") : " · not scheduled"}`}
                  aria-label={cell.date}
                  className={clsx(
                    "h-3 flex-1 rounded-[3px] transition",
                    tone,
                    cell.isToday && "ring-1 ring-white/40",
                    editable ? "cursor-pointer hover:opacity-80" : "cursor-default",
                  )}
                />
              );
            })}
          </div>
        </>
      )}
    </li>
  );
}

function IconBtn({
  label,
  onClick,
  Icon,
  danger,
}: {
  label: string;
  onClick: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx(
        "rounded-md p-1.5 text-muted transition-colors",
        danger
          ? "hover:bg-red-500/10 hover:text-red-300"
          : "hover:bg-neutral-800 hover:text-neutral-100",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
