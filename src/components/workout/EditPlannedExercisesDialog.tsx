"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { onSnapshot, type QuerySnapshot } from "firebase/firestore";

import type { Exercise, PlannedExercise } from "@/lib/db/types";
import { EXERCISE_MASTER } from "@/lib/data/exerciseMaster";
import { exercisesPath } from "@/lib/db/paths";
import { useAuth } from "@/lib/auth/useAuth";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import { pushRecent } from "@/lib/workout/recentExercises";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ExerciseSwapPicker, { buildPickerPool } from "./ExerciseSwapPicker";

/**
 * Swap performed during this edit session, surfaced to the parent so it can
 * prompt "save this swap to the program?".
 *
 * `sessionId` is the preferred match key for `applyProgramSwap` — it survives
 * the user renaming the session between the swap and the prompt. `sessionName`
 * remains for display + as a legacy fallback for sessions whose id has drifted
 * (e.g. ad-hoc / freeform sessions started without a programSessionId).
 */
export interface PlannedExerciseSwap {
  fromId: string;
  toId: string;
  /** Stable program session id (matches `ProgramSession.id`). May be empty for ad-hoc sessions. */
  sessionId: string;
  /** The session name we're editing (e.g. "Upper A"). Used for display + legacy fallback. */
  sessionName: string;
}

export interface EditPlannedExercisesDialogProps {
  open: boolean;
  title: string;
  /** Display name of the session being edited (for the "save swap?" prompt). */
  sessionName: string;
  /** Program session id — captured at swap time so applyProgramSwap can match
   *  on id even if the user renames the session later. Empty for ad-hoc. */
  sessionId?: string;
  initial: PlannedExercise[];
  /**
   * Mid-session only: exercises with logged sets. Used to confirm before
   * a destructive swap/remove that would orphan those sets.
   */
  loggedExerciseIds?: Set<string>;
  onSave: (next: PlannedExercise[], swaps: PlannedExerciseSwap[]) => void;
  onCancel: () => void;
}

type Draft = PlannedExercise;
type PoolEntry = ReturnType<typeof buildPickerPool>[number];

/** Re-number `order` sequentially from 0. */
function renumber(list: Draft[]): Draft[] {
  return list.map((p, i) => ({ ...p, order: i }));
}

/** Format a rep range for the single-input field. */
function formatReps(low: number, high: number): string {
  if (low === high) return String(low);
  return `${low}-${high}`;
}

/** Parse a reps string ("8" or "8-12"). Returns null if it doesn't conform. */
function parseReps(value: string): { low: number; high: number } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (Number.isFinite(low) && Number.isFinite(high)) {
      return { low, high };
    }
    return null;
  }
  const single = /^(\d+)$/.exec(trimmed);
  if (single) {
    const n = Number(single[1]);
    if (Number.isFinite(n)) return { low: n, high: n };
  }
  return null;
}

/** Per-row validation. */
function validateRow(d: Draft, repsText: string): string | null {
  if (!d.name || d.name.trim().length === 0) return "Name is required.";
  if (!Number.isFinite(d.targetSets) || d.targetSets < 1) {
    return "Sets must be at least 1.";
  }
  const parsed = parseReps(repsText);
  if (!parsed) return "Reps must be a number or range like 8-12.";
  if (parsed.low < 1) return "Reps must be at least 1.";
  if (parsed.low > parsed.high) return "Low reps can't exceed high reps.";
  return null;
}

export default function EditPlannedExercisesDialog({
  open,
  title,
  sessionName,
  sessionId,
  initial,
  loggedExerciseIds,
  onSave,
  onCancel,
}: EditPlannedExercisesDialogProps) {
  const { user } = useAuth();

  // Local draft state — only committed on Save.
  const [draft, setDraft] = useState<Draft[]>(() =>
    renumber([...initial].sort((a, b) => a.order - b.order)),
  );

  // Per-row reps text. Index-aligned with `draft`. Kept separate so a partial/
  // invalid mid-edit input ("8-") doesn't immediately clobber the numbers.
  const [repsText, setRepsText] = useState<string[]>(() =>
    [...initial]
      .sort((a, b) => a.order - b.order)
      .map((d) => formatReps(d.repRangeLow, d.repRangeHigh)),
  );

  // Notes-row open state: undefined = derive from notes being non-empty.
  // Once the user explicitly opens, we keep it open even if they clear the
  // text mid-edit.
  const [notesOpenForIndex, setNotesOpenForIndex] = useState<Set<number>>(
    () => new Set(),
  );

  // Track swaps performed during this edit. Multiple swaps to the same slot
  // collapse to a single "fromId → final toId" entry (the original-from is
  // preserved so the program update can find the right exercise).
  const [swaps, setSwaps] = useState<PlannedExerciseSwap[]>([]);

  // Picker state — null = closed; { mode: "swap", index } or { mode: "add" }.
  const [picker, setPicker] = useState<
    | { mode: "swap"; index: number }
    | { mode: "add" }
    | null
  >(null);

  // Confirm dialog for destructive actions on logged exercises.
  const [confirm, setConfirm] = useState<
    | { kind: "remove"; index: number; name: string }
    | { kind: "swap"; index: number; newId: string; oldName: string; newName: string }
    | null
  >(null);

  // Subscribe to the user's exercise collection so the picker pool reflects
  // user-created exercises immediately (the picker writes to it on "Create
  // custom" and we want the new doc to appear as soon as it's flushed).
  const [userExercises, setUserExercises] = useState<
    ReadonlyArray<{ id: string; ex: Exercise }>
  >([]);
  useEffect(() => {
    if (!open || !user?.uid) return;
    const unsub = onSnapshot(
      exercisesPath(user.uid),
      (snap: QuerySnapshot<Exercise>) => {
        setUserExercises(snap.docs.map((d) => ({ id: d.id, ex: d.data() })));
      },
    );
    return () => unsub();
  }, [open, user?.uid]);

  const pickerPool: PoolEntry[] = useMemo(() => {
    if (userExercises.length === 0) {
      // Fall back to seeded master only.
      return buildPickerPool([]);
    }
    return buildPickerPool(userExercises);
  }, [userExercises]);

  /** Resolve a display name from the picker pool (with EXERCISE_MASTER fallback). */
  function nameForExerciseId(id: string): string {
    const fromPool = pickerPool.find((e) => e.id === id);
    if (fromPool) return fromPool.name;
    const fromMaster = EXERCISE_MASTER.find((e) => e.id === id);
    return fromMaster?.name ?? id;
  }

  // Form-level error banner shown when save is blocked.
  const [saveError, setSaveError] = useState<string | null>(null);

  useBodyScrollLock(open);

  // Reset draft + swaps whenever the dialog opens for a fresh edit.
  useEffect(() => {
    if (open) {
      const sorted = [...initial].sort((a, b) => a.order - b.order);
      setDraft(renumber(sorted));
      setRepsText(sorted.map((d) => formatReps(d.repRangeLow, d.repRangeHigh)));
      setNotesOpenForIndex(
        new Set(
          sorted
            .map((d, i) => (d.notes && d.notes.length > 0 ? i : -1))
            .filter((i) => i >= 0),
        ),
      );
      setSwaps([]);
      setPicker(null);
      setConfirm(null);
      setSaveError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc to cancel (only when no nested picker/confirm is open).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !picker && !confirm) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, picker, confirm, onCancel]);

  const draftIds = useMemo(() => draft.map((d) => d.exerciseId), [draft]);

  // Sensors — short delay on touch so tapping inputs doesn't start a drag,
  // small distance threshold on pointer so a click on the handle still
  // registers as a click rather than a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Per-row validation errors, recomputed each render. Cheap (typically < 10
  // rows) and keeps the inline error messages in sync with the inputs.
  const rowErrors = useMemo(
    () => draft.map((d, i) => validateRow(d, repsText[i] ?? "")),
    [draft, repsText],
  );

  if (!open) return null;

  // ---------------------------------------------------------------------------
  // Mutators
  // ---------------------------------------------------------------------------

  function updateSets(index: number, value: number) {
    setDraft((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        targetSets: Math.max(0, Math.min(20, Math.round(value) || 0)),
      };
      return next;
    });
  }

  function updateRepsText(index: number, value: string) {
    setRepsText((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    // Also update the numeric fields when the text parses cleanly, so the
    // committed draft stays in sync. If it doesn't parse, leave the numbers
    // alone; validation will block save.
    const parsed = parseReps(value);
    if (parsed) {
      setDraft((prev) => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          repRangeLow: parsed.low,
          repRangeHigh: parsed.high,
        };
        return next;
      });
    }
  }

  function updateNotes(index: number, value: string) {
    const trimmed = value.slice(0, 500);
    setDraft((prev) => {
      const next = [...prev];
      const cleaned = trimmed.length === 0 ? undefined : trimmed;
      next[index] = { ...next[index], notes: cleaned };
      return next;
    });
  }

  function openNotes(index: number) {
    setNotesOpenForIndex((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }

  function removeAt(index: number) {
    setDraft((prev) => renumber(prev.filter((_, i) => i !== index)));
    setRepsText((prev) => prev.filter((_, i) => i !== index));
    setNotesOpenForIndex((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  }

  function requestRemove(index: number) {
    const ex = draft[index];
    if (loggedExerciseIds?.has(ex.exerciseId)) {
      setConfirm({ kind: "remove", index, name: ex.name });
      return;
    }
    removeAt(index);
  }

  /** Apply a swap to draft + track it in the swaps array. */
  function applySwap(index: number, newId: string) {
    const original = draft[index];
    const fromId = original.exerciseId;
    if (fromId === newId) return;
    const newName = nameForExerciseId(newId);
    pushRecent(newId);
    setDraft((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], exerciseId: newId, name: newName };
      return next;
    });
    setSwaps((prev) => {
      // Collapse repeat swaps on the same original slot.
      const filtered = prev.filter((s) => s.fromId !== fromId);
      // Avoid recording a swap that ends up back at the original id elsewhere
      // (e.g. user swapped A→B→A — net zero, skip the prompt).
      if (newId === fromId) return filtered;
      return [
        ...filtered,
        { fromId, toId: newId, sessionId: sessionId ?? "", sessionName },
      ];
    });
  }

  function requestSwap(index: number, newId: string) {
    const original = draft[index];
    if (original.exerciseId === newId) {
      setPicker(null);
      return;
    }
    if (loggedExerciseIds?.has(original.exerciseId)) {
      setConfirm({
        kind: "swap",
        index,
        newId,
        oldName: original.name,
        newName: nameForExerciseId(newId),
      });
      setPicker(null);
      return;
    }
    applySwap(index, newId);
    setPicker(null);
  }

  function addExercise(newId: string) {
    const newName = nameForExerciseId(newId);
    pushRecent(newId);
    setDraft((prev) => {
      const next: Draft = {
        exerciseId: newId,
        name: newName,
        targetSets: 3,
        repRangeLow: 8,
        repRangeHigh: 12,
        order: prev.length,
      };
      return renumber([...prev, next]);
    });
    setRepsText((prev) => [...prev, formatReps(8, 12)]);
    setPicker(null);
  }

  function handlePick(newId: string) {
    if (!picker) return;
    if (picker.mode === "swap") {
      requestSwap(picker.index, newId);
      return;
    }
    addExercise(newId);
  }

  function handleConfirm() {
    if (!confirm) return;
    if (confirm.kind === "remove") {
      removeAt(confirm.index);
    } else {
      applySwap(confirm.index, confirm.newId);
    }
    setConfirm(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      const oldIndex = prev.findIndex((d) => rowId(d, prev) === active.id);
      const newIndex = prev.findIndex((d) => rowId(d, prev) === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      // Reorder both draft + repsText + notesOpen in lock-step.
      const movedDraft = arrayMove(prev, oldIndex, newIndex);
      setRepsText((rt) => arrayMove(rt, oldIndex, newIndex));
      setNotesOpenForIndex((set) => {
        const arr = Array.from({ length: prev.length }, (_, i) => set.has(i));
        const moved = arrayMove(arr, oldIndex, newIndex);
        const out = new Set<number>();
        moved.forEach((flag, i) => {
          if (flag) out.add(i);
        });
        return out;
      });
      return renumber(movedDraft);
    });
  }

  function handleSave() {
    // Validate every row before committing.
    const errors = draft.map((d, i) => validateRow(d, repsText[i] ?? ""));
    const hasError = errors.some((e) => e !== null);
    if (hasError) {
      setSaveError("Fix errors before saving.");
      return;
    }
    setSaveError(null);
    onSave(renumber(draft), swaps);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Build stable ids for sortable rows. We use exerciseId + index because the
  // same exerciseId can appear twice if the user temporarily has duplicates
  // mid-edit (unlikely, but the picker excludes dupes so usually only one).
  const ids = draft.map((d, i) => rowId(d, draft, i));

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 backdrop-blur sm:items-center p-4"
        onClick={onCancel}
      >
        <div
          className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
            <Pencil className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-neutral-800 hover:text-neutral-100"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          {/* Top-level validation banner */}
          {saveError ? (
            <div
              role="alert"
              aria-live="polite"
              className="border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300"
            >
              {saveError}
            </div>
          ) : null}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {draft.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted">
                No exercises in this session. Tap “Add exercise” below.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={ids}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-2">
                    {draft.map((ex, i) => {
                      const wasLogged =
                        loggedExerciseIds?.has(ex.exerciseId) ?? false;
                      const rowError = rowErrors[i];
                      const reps = repsText[i] ?? "";
                      const notesShown =
                        notesOpenForIndex.has(i) ||
                        (ex.notes && ex.notes.length > 0);
                      return (
                        <SortableRow
                          key={ids[i]}
                          id={ids[i]}
                          wasLogged={wasLogged}
                          error={rowError}
                        >
                          {/* Main content */}
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => setPicker({ mode: "swap", index: i })}
                              className="group flex w-full items-center gap-1.5 text-left"
                              aria-label={`Swap ${ex.name}`}
                            >
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">
                                {ex.name}
                              </span>
                              <Pencil
                                aria-hidden="true"
                                className="h-3 w-3 shrink-0 text-muted opacity-60 group-hover:opacity-100"
                              />
                            </button>
                            {wasLogged ? (
                              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-amber-300/80">
                                Already logged this session
                              </p>
                            ) : null}

                            {/* Sets + single reps input */}
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              <label className="flex items-center gap-1 text-muted">
                                <span>Sets</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={ex.targetSets}
                                  onChange={(e) =>
                                    updateSets(i, Number(e.target.value))
                                  }
                                  className="h-8 w-14 rounded-md border border-border bg-bg px-2 text-center text-sm text-neutral-100 outline-none focus:border-accent"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-muted">
                                <span>Reps</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={reps}
                                  onChange={(e) =>
                                    updateRepsText(i, e.target.value)
                                  }
                                  placeholder="8-12"
                                  className="h-8 w-20 rounded-md border border-border bg-bg px-2 text-center text-sm text-neutral-100 outline-none focus:border-accent"
                                />
                              </label>
                              {!notesShown ? (
                                <button
                                  type="button"
                                  onClick={() => openNotes(i)}
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-neutral-900 px-2 text-[11px] font-medium text-muted hover:bg-neutral-800 hover:text-neutral-100"
                                >
                                  <StickyNote
                                    aria-hidden="true"
                                    className="h-3 w-3"
                                  />
                                  Add note
                                </button>
                              ) : null}
                            </div>

                            {notesShown ? (
                              <div className="mt-2">
                                <label className="sr-only" htmlFor={`notes-${i}`}>
                                  Notes for {ex.name}
                                </label>
                                <textarea
                                  id={`notes-${i}`}
                                  value={ex.notes ?? ""}
                                  onChange={(e) => updateNotes(i, e.target.value)}
                                  maxLength={500}
                                  rows={2}
                                  placeholder="e.g. tempo 3-1-1, drop set on last"
                                  className="w-full resize-y rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-accent"
                                />
                                <p className="mt-0.5 text-right text-[10px] text-muted/70">
                                  {(ex.notes ?? "").length}/500
                                </p>
                              </div>
                            ) : null}

                            {rowError ? (
                              <p
                                role="alert"
                                className="mt-1 text-[11px] text-red-300"
                              >
                                {rowError}
                              </p>
                            ) : null}
                          </div>

                          {/* Remove */}
                          <button
                            type="button"
                            onClick={() => requestRemove(i)}
                            aria-label={`Remove ${ex.name}`}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-red-500/10 hover:text-red-300"
                          >
                            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        </SortableRow>
                      );
                    })}
                  </ul>
                </SortableContext>
              </DndContext>
            )}

            {/* Add exercise */}
            <button
              type="button"
              onClick={() => setPicker({ mode: "add" })}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-neutral-900/30 px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-900/60"
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              Add exercise
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border bg-neutral-900/40 px-4 py-3">
            <button
              type="button"
              onClick={onCancel}
              className="h-9 rounded-md border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Nested swap / add picker */}
      {user?.uid ? (
        <ExerciseSwapPicker
          open={!!picker}
          uid={user.uid}
          pool={pickerPool}
          forExerciseId={
            picker?.mode === "swap" ? draft[picker.index]?.exerciseId : undefined
          }
          excludeIds={picker?.mode === "add" ? draftIds : undefined}
          onPick={handlePick}
          onCancel={() => setPicker(null)}
        />
      ) : null}

      {/* Destructive-action confirm */}
      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.kind === "remove"
            ? `Remove ${confirm.name}?`
            : confirm?.kind === "swap"
              ? `Swap ${confirm.oldName} → ${confirm.newName}?`
              : ""
        }
        description={
          confirm
            ? "You've already logged sets for this exercise. The logged sets stay in your history, but the exercise won't be in the active plan anymore."
            : undefined
        }
        confirmLabel={confirm?.kind === "remove" ? "Remove" : "Swap"}
        tone="danger"
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

/**
 * One sortable row in the planned-exercise list. The drag handle (GripVertical)
 * is the *only* element wired to `attributes`/`listeners` so the rest of the
 * row (text inputs, swap button, trash button) stays clickable on touch.
 */
function SortableRow({
  id,
  wasLogged,
  error,
  children,
}: {
  id: string;
  wasLogged: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        "rounded-lg border bg-neutral-900/40 p-2.5",
        error
          ? "border-red-500/60"
          : wasLogged
            ? "border-amber-500/40"
            : "border-border",
        isDragging ? "shadow-lg" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle — only this element gets the dnd listeners. */}
        <button
          type="button"
          ref={null}
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="inline-flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted hover:bg-neutral-800 hover:text-neutral-200 active:cursor-grabbing"
        >
          <GripVertical aria-hidden="true" className="h-4 w-4" />
        </button>

        {children}
      </div>
    </li>
  );
}

/** Stable sortable-id helper. Uses exerciseId + index for uniqueness. */
function rowId(d: Draft, list: Draft[], idx?: number): string {
  const i = typeof idx === "number" ? idx : list.indexOf(d);
  return `${d.exerciseId}::${i}`;
}
