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
  writeBatch,
} from "firebase/firestore";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Flame,
  Pause,
  Pencil,
  Play,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase";
import clsx from "clsx";

import { useUserData } from "@/lib/data/UserDataProvider";
import { routinePath, routinesPath } from "@/lib/db/paths";
import type { RoutineDoc, RoutineTimeBlock } from "@/lib/db/types";
import {
  DOW_LABELS,
  DOW_PRESETS,
  FALLBACK_BLOCK_ID,
  addDaysIso,
  buildHeatmap,
  computeBestStreak,
  computeStreak,
  dowOfIso,
  formatSchedule,
  groupRoutinesByBlock,
  resolveTimeBlocks,
} from "@/lib/routines/helpers";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import TimeBlockManager, {
  BlockIcon,
} from "@/components/todos/TimeBlockManager";

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
  const [manageBlocks, setManageBlocks] = useState(false);

  // -- Time blocks from profile ------------------------------------------------
  const timeBlocks = useMemo(
    () => resolveTimeBlocks(effectiveProfile ?? undefined),
    [effectiveProfile],
  );

  // -- Add form state ----------------------------------------------------------
  const [name, setName] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>(DOW_PRESETS.daily);
  const [selectedBlock, setSelectedBlock] = useState<string>(FALLBACK_BLOCK_ID);
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

  // -- Grouped routines --------------------------------------------------------
  const grouped = useMemo(() => {
    if (!rows) return null;
    return groupRoutinesByBlock(rows, timeBlocks);
  }, [rows, timeBlocks]);

  // -- Collapsed state per block -----------------------------------------------
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (blockId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  };

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
          timeBlock: selectedBlock,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as unknown as RoutineDoc);
        setName("");
        setWeekdays(DOW_PRESETS.daily);
        setSelectedBlock(FALLBACK_BLOCK_ID);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add routine");
      } finally {
        setAdding(false);
      }
    },
    [name, weekdays, uid, adding, selectedBlock],
  );

  // -- Manage blocks mode ------------------------------------------------------
  if (manageBlocks && uid) {
    return (
      <section className="space-y-4">
        <TimeBlockManager
          uid={uid}
          blocks={timeBlocks}
          onDismiss={() => setManageBlocks(false)}
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {/* Header with manage blocks button */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setManageBlocks(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-2.5 py-1.5 text-[10px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Manage Blocks
        </button>
      </div>

      {/* Add form */}
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

        {/* Block selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Block
          </span>
          <div className="flex flex-wrap gap-1.5">
            {timeBlocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => setSelectedBlock(block.id)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                  selectedBlock === block.id
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border bg-neutral-900 text-muted hover:text-neutral-200",
                )}
              >
                <BlockIcon name={block.icon} className="h-3 w-3" />
                {block.label}
              </button>
            ))}
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

      {grouped === null ? (
        <div className="space-y-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : rows && rows.length === 0 ? (
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
        <div className="space-y-3">
          {grouped?.map(({ block, routines: blockRoutines }) => (
            <TimeBlockGroup
              key={block.id}
              uid={uid!}
              block={block}
              routines={blockRoutines}
              today={today}
              todayDow={todayDow}
              timeBlocks={timeBlocks}
              collapsed={collapsed.has(block.id)}
              onToggleCollapse={() => toggleCollapse(block.id)}
              onError={setError}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Time block group
// ---------------------------------------------------------------------------

interface TimeBlockGroupProps {
  uid: string;
  block: RoutineTimeBlock;
  routines: Row[];
  today: string;
  todayDow: number;
  timeBlocks: RoutineTimeBlock[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onError: (msg: string) => void;
}

function TimeBlockGroup({
  uid,
  block,
  routines,
  today,
  todayDow,
  timeBlocks,
  collapsed,
  onToggleCollapse,
  onError,
}: TimeBlockGroupProps) {
  const scheduledCount = routines.filter(
    (r) => r.data.active && r.data.weekdays?.includes(todayDow),
  ).length;
  const doneCount = routines.filter(
    (r) =>
      r.data.active &&
      r.data.weekdays?.includes(todayDow) &&
      r.data.done?.[today],
  ).length;

  const moveRoutine = useCallback(
    async (idx: number, dir: -1 | 1) => {
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= routines.length) return;

      const batch = writeBatch(getFirebaseDb());

      routines.forEach((row, i) => {
        let nextOrder = i;
        if (i === idx) {
          nextOrder = targetIdx;
        } else if (i === targetIdx) {
          nextOrder = idx;
        }

        if (row.data.order !== nextOrder) {
          batch.update(routinePath(uid, row.id), {
            order: nextOrder,
            updatedAt: serverTimestamp(),
          });
        }
      });

      try {
        await batch.commit();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to reorder routines");
      }
    },
    [uid, routines, onError],
  );

  return (
    <div className="rounded-xl border border-border bg-neutral-900/40 overflow-hidden">
      {/* Block header */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-neutral-800/30"
      >
        <BlockIcon name={block.icon} className="h-4 w-4 shrink-0 text-accent" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-neutral-100">
          {block.label}
        </span>
        <span className="text-[10px] text-muted tabular-nums">
          {routines.length} routine{routines.length !== 1 ? "s" : ""}
          {scheduledCount > 0 && (
            <span className="ml-1.5 text-cyan-300">
              · {doneCount}/{scheduledCount} today
            </span>
          )}
        </span>
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
        )}
      </button>

      {/* Routine cards */}
      {!collapsed && (
        <div className="border-t border-border/50">
          {routines.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-muted italic">
              No routines in this block yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/30">
              {routines.map((row, idx) => (
                <RoutineCard
                  key={row.id}
                  uid={uid}
                  row={row}
                  today={today}
                  todayDow={todayDow}
                  timeBlocks={timeBlocks}
                  onError={onError}
                  idx={idx}
                  onMove={(dir) => moveRoutine(idx, dir)}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < routines.length - 1}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
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
  timeBlocks: RoutineTimeBlock[];
  onError: (msg: string) => void;
  idx?: number;
  onMove?: (dir: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

function RoutineCard({
  uid,
  row,
  today,
  todayDow,
  timeBlocks,
  onError,
  onMove,
  canMoveUp,
  canMoveDown,
}: RoutineCardProps) {
  const { id, data } = row;
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(data.name);
  const [draftDays, setDraftDays] = useState<number[]>(data.weekdays);
  const [draftBlock, setDraftBlock] = useState<string>(
    data.timeBlock ?? FALLBACK_BLOCK_ID,
  );
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

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
    setRemoving(true);
    try {
      await deleteDoc(routinePath(uid, id));
      setConfirmOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setRemoving(false);
    }
  }, [uid, id, onError]);

  const saveEdit = useCallback(async () => {
    const trimmed = draftName.trim();
    if (!trimmed || draftDays.length === 0) return;
    setSaving(true);
    try {
      await updateDoc(routinePath(uid, id), {
        name: trimmed,
        weekdays: [...draftDays].sort(),
        timeBlock: draftBlock,
        updatedAt: serverTimestamp(),
      });
      setEditing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [uid, id, draftName, draftDays, draftBlock, onError]);

  return (
    <li
      className={clsx(
        "px-4 py-3 transition-opacity",
        data.active ? "" : "opacity-60",
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

          {/* Block selector in edit mode */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Block
            </span>
            <div className="flex flex-wrap gap-1">
              {timeBlocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => setDraftBlock(block.id)}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    draftBlock === block.id
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border bg-neutral-900 text-muted hover:text-neutral-200",
                  )}
                >
                  <BlockIcon name={block.icon} className="h-3 w-3" />
                  {block.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraftName(data.name);
                setDraftDays(data.weekdays);
                setDraftBlock(data.timeBlock ?? FALLBACK_BLOCK_ID);
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
                  {canMoveUp && (
                    <IconBtn
                      label="Move up"
                      onClick={() => onMove?.(-1)}
                      Icon={ChevronUp}
                    />
                  )}
                  {canMoveDown && (
                    <IconBtn
                      label="Move down"
                      onClick={() => onMove?.(1)}
                      Icon={ChevronDown}
                    />
                  )}
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
                  <IconBtn
                    label="Delete"
                    onClick={() => setConfirmOpen(true)}
                    Icon={Trash2}
                    danger
                  />
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

          <ConfirmDialog
            open={confirmOpen}
            tone="danger"
            title={`Delete "${data.name}"?`}
            description="This routine and its entire streak history will be removed. This can't be undone."
            confirmLabel="Delete"
            busy={removing}
            onConfirm={remove}
            onCancel={() => setConfirmOpen(false)}
          />

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
