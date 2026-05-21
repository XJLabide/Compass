"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import type { PlannedExercise } from "@/lib/db/types";
import { EXERCISE_MASTER } from "@/lib/data/exerciseMaster";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ExerciseSwapPicker from "./ExerciseSwapPicker";

/**
 * Swap performed during this edit session, surfaced to the parent so it can
 * prompt "save this swap to the program?".
 */
export interface PlannedExerciseSwap {
  fromId: string;
  toId: string;
  /** The session name we're editing (e.g. "Upper A"). */
  sessionName: string;
}

export interface EditPlannedExercisesDialogProps {
  open: boolean;
  title: string;
  /** Display name of the session being edited (for the "save swap?" prompt). */
  sessionName: string;
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

/** Look up the display name from the seeded master list; falls back to the id. */
function nameForExerciseId(id: string): string {
  const found = EXERCISE_MASTER.find((e) => e.id === id);
  return found?.name ?? id;
}

/** Re-number `order` sequentially from 0. */
function renumber(list: Draft[]): Draft[] {
  return list.map((p, i) => ({ ...p, order: i }));
}

export default function EditPlannedExercisesDialog({
  open,
  title,
  sessionName,
  initial,
  loggedExerciseIds,
  onSave,
  onCancel,
}: EditPlannedExercisesDialogProps) {
  // Local draft state — only committed on Save.
  const [draft, setDraft] = useState<Draft[]>(() =>
    renumber([...initial].sort((a, b) => a.order - b.order)),
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

  useBodyScrollLock(open);

  // Reset draft + swaps whenever the dialog opens for a fresh edit.
  useEffect(() => {
    if (open) {
      setDraft(renumber([...initial].sort((a, b) => a.order - b.order)));
      setSwaps([]);
      setPicker(null);
      setConfirm(null);
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

  if (!open) return null;

  // ---------------------------------------------------------------------------
  // Mutators
  // ---------------------------------------------------------------------------

  function updateField(
    index: number,
    patch: Partial<Pick<Draft, "targetSets" | "repRangeLow" | "repRangeHigh">>,
  ) {
    setDraft((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    setDraft((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return renumber(next);
    });
  }

  function moveDown(index: number) {
    setDraft((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index + 1], next[index]] = [next[index], next[index + 1]];
      return renumber(next);
    });
  }

  function removeAt(index: number) {
    setDraft((prev) => renumber(prev.filter((_, i) => i !== index)));
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
      return [...filtered, { fromId, toId: newId, sessionName }];
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

  function handleSave() {
    onSave(renumber(draft), swaps);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {draft.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted">
                No exercises in this session. Tap “Add exercise” below.
              </p>
            ) : (
              <ul className="space-y-2">
                {draft.map((ex, i) => {
                  const wasLogged = loggedExerciseIds?.has(ex.exerciseId) ?? false;
                  return (
                    <li
                      key={`${ex.exerciseId}-${i}`}
                      className="rounded-lg border border-border bg-neutral-900/40 p-2.5"
                    >
                      <div className="flex items-start gap-2">
                        {/* Reorder controls */}
                        <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
                          <GripVertical
                            aria-hidden="true"
                            className="h-3.5 w-3.5 text-muted/60"
                          />
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={() => moveUp(i)}
                              disabled={i === 0}
                              aria-label={`Move ${ex.name} up`}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-neutral-800 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <ArrowUp aria-hidden="true" className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveDown(i)}
                              disabled={i === draft.length - 1}
                              aria-label={`Move ${ex.name} down`}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-neutral-800 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <ArrowDown aria-hidden="true" className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

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

                          {/* Sets × reps inputs */}
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <label className="flex items-center gap-1 text-muted">
                              <span>Sets</span>
                              <input
                                type="number"
                                min={0}
                                max={20}
                                value={ex.targetSets}
                                onChange={(e) =>
                                  updateField(i, {
                                    targetSets: Math.max(
                                      0,
                                      Math.min(20, Number(e.target.value) || 0),
                                    ),
                                  })
                                }
                                className="h-8 w-14 rounded-md border border-border bg-bg px-2 text-center text-sm text-neutral-100 outline-none focus:border-accent"
                              />
                            </label>
                            <label className="flex items-center gap-1 text-muted">
                              <span>Reps</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={ex.repRangeLow}
                                onChange={(e) =>
                                  updateField(i, {
                                    repRangeLow: Math.max(
                                      0,
                                      Math.min(100, Number(e.target.value) || 0),
                                    ),
                                  })
                                }
                                className="h-8 w-14 rounded-md border border-border bg-bg px-2 text-center text-sm text-neutral-100 outline-none focus:border-accent"
                              />
                              <span aria-hidden="true">–</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={ex.repRangeHigh}
                                onChange={(e) =>
                                  updateField(i, {
                                    repRangeHigh: Math.max(
                                      0,
                                      Math.min(100, Number(e.target.value) || 0),
                                    ),
                                  })
                                }
                                className="h-8 w-14 rounded-md border border-border bg-bg px-2 text-center text-sm text-neutral-100 outline-none focus:border-accent"
                              />
                            </label>
                          </div>
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
                      </div>
                    </li>
                  );
                })}
              </ul>
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
      <ExerciseSwapPicker
        open={!!picker}
        forExerciseId={
          picker?.mode === "swap" ? draft[picker.index]?.exerciseId : undefined
        }
        excludeIds={picker?.mode === "add" ? draftIds : undefined}
        onPick={handlePick}
        onCancel={() => setPicker(null)}
      />

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
