"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Pencil,
  Plus,
  Replace,
  Save,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";

import { useUserData } from "@/lib/data/UserDataProvider";
import { programPath } from "@/lib/db/paths";
import type {
  PlannedExercise,
  ProgramDoc,
  ProgramSession,
} from "@/lib/db/types";
import Skeleton from "@/components/ui/Skeleton";
import ExercisePicker from "@/components/program/ExercisePicker";
import SwitchProgramDialog from "@/components/workout/SwitchProgramDialog";

/**
 * `/workout/program` — full editor for the user's single active program.
 *
 * State is held locally as `draft` and only persisted when the user clicks
 * Save. Cancel discards back to the realtime-subscribed `program`. We chose
 * the explicit Save model (vs. autosave on every keystroke) because the
 * program doc is the source of truth for every future session — it's worth
 * an explicit user gesture to ratify changes.
 */
export default function ProgramEditorPage() {
  const { uid } = useUserData();
  const [program, setProgram] = useState<ProgramDoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<ProgramDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  // -------------------------------------------------------------------------
  // Load the program. Keep the "draft" in sync only when there are no local
  // edits yet (i.e. on first load); subsequent realtime updates don't trash
  // a user mid-edit.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      programPath(uid),
      (snap) => {
        const data = snap.data() ?? null;
        setProgram(data);
        setLoaded(true);
        setDraft((curr) => curr ?? data);
      },
      (err) => {
        setError(err.message);
        setLoaded(true);
      },
    );
    return () => unsub();
  }, [uid]);

  const dirty = useMemo(() => {
    if (!draft || !program) return false;
    return JSON.stringify(draft) !== JSON.stringify(program);
  }, [draft, program]);

  // -------------------------------------------------------------------------
  // Draft mutation helpers.
  // -------------------------------------------------------------------------
  const setName = (next: string) =>
    setDraft((d) => (d ? { ...d, name: next } : d));

  const updateSession = (
    sessionId: string,
    mutator: (s: ProgramSession) => ProgramSession,
  ) =>
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        sessions: d.sessions.map((s) =>
          s.id === sessionId ? mutator(s) : s,
        ),
      };
    });

  const addSession = () =>
    setDraft((d) => {
      if (!d) return d;
      const id = `session-${Date.now().toString(36)}`;
      return {
        ...d,
        sessions: [
          ...d.sessions,
          { id, name: `Session ${d.sessions.length + 1}`, exercises: [] },
        ],
      };
    });

  const deleteSession = (sessionId: string) =>
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        sessions: d.sessions.filter((s) => s.id !== sessionId),
      };
    });

  // -------------------------------------------------------------------------
  // Persist.
  // -------------------------------------------------------------------------
  const save = useCallback(async () => {
    if (!uid || !draft) return;
    setSaving(true);
    setError(null);
    try {
      // Normalize: re-index each exercise's `order` and bump the doc's
      // updatedAt.
      const normalized: ProgramDoc = {
        ...draft,
        sessions: draft.sessions.map((s) => ({
          ...s,
          exercises: s.exercises.map((ex, idx) => ({ ...ex, order: idx })),
        })),
        updatedAt: serverTimestamp() as unknown as ProgramDoc["updatedAt"],
      };
      await setDoc(programPath(uid), normalized, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [uid, draft]);

  const cancel = () => setDraft(program);

  // -------------------------------------------------------------------------
  // Render.
  // -------------------------------------------------------------------------
  if (!uid) return null;

  if (!loaded) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </section>
    );
  }

  if (!draft) {
    return (
      <section className="space-y-4">
        <Link
          href="/workout"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-neutral-200"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to workout
        </Link>
        <div className="rounded-xl border border-dashed border-border bg-neutral-900/30 px-4 py-10 text-center">
          <p className="text-sm font-medium text-neutral-100">
            No program yet.
          </p>
          <p className="mt-1 text-xs text-muted">
            Your seed should auto-create one. If this persists, sign out and back in.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="space-y-3">
        <Link
          href="/workout"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-neutral-200"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to workout
        </Link>
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
            Program editor
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSwitchOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 hover:bg-neutral-800"
            >
              <Replace className="h-3.5 w-3.5 text-accent" />
              Switch program
            </button>
            <SaveBar
              dirty={dirty}
              saving={saving}
              saved={saved}
              onSave={save}
              onCancel={cancel}
            />
          </div>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      {/* Program name */}
      <div className="rounded-xl border border-border bg-neutral-900/40 p-4 space-y-2">
        <label
          htmlFor="program-name"
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted"
        >
          Program name
        </label>
        <input
          id="program-name"
          type="text"
          value={draft.name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-base text-neutral-100 focus:border-accent focus:outline-none"
        />
      </div>

      {/* Sessions */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Sessions
          </h2>
          <button
            type="button"
            onClick={addSession}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 hover:bg-neutral-800"
          >
            <Plus className="h-3 w-3 text-accent" />
            Add session
          </button>
        </div>
        {draft.sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-neutral-900/30 px-4 py-8 text-center text-sm text-muted">
            No sessions. Click <strong>Add session</strong> to start.
          </div>
        ) : (
          draft.sessions.map((session) => (
            <SessionEditor
              key={session.id}
              uid={uid}
              session={session}
              onUpdate={(m) => updateSession(session.id, m)}
              onDelete={() => deleteSession(session.id)}
            />
          ))
        )}
      </div>

      {/* Sticky save bar on mobile */}
      {dirty ? (
        <div className="sticky bottom-0 -mx-4 mt-6 border-t border-border bg-panel/95 px-4 py-3 backdrop-blur md:hidden">
          <SaveBar
            dirty={dirty}
            saving={saving}
            saved={saved}
            onSave={save}
            onCancel={cancel}
            stretch
          />
        </div>
      ) : null}

      {/* Template picker */}
      {switchOpen ? (
        <SwitchProgramDialog
          uid={uid}
          onClose={() => setSwitchOpen(false)}
          onApplied={() => {
            // The onSnapshot listener will pick up the new program doc and
            // reset `draft` on next load. Force-clear draft so the editor
            // reflects the incoming snapshot immediately.
            setDraft(null);
          }}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Save bar — used at the top header and as a mobile sticky footer.
// ---------------------------------------------------------------------------
function SaveBar({
  dirty,
  saving,
  saved,
  onSave,
  onCancel,
  stretch,
}: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onCancel: () => void;
  stretch?: boolean;
}) {
  return (
    <div className={clsx("flex items-center gap-2", stretch && "w-full")}>
      {saved ? (
        <span className="text-xs text-emerald-300">Saved</span>
      ) : null}
      <button
        type="button"
        onClick={onCancel}
        disabled={!dirty || saving}
        className={clsx(
          "h-9 rounded-md border border-border bg-neutral-900 px-3 text-xs text-muted hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40",
          stretch && "flex-1",
        )}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className={clsx(
          "inline-flex h-9 items-center gap-1 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40",
          stretch && "flex-1 justify-center",
        )}
      >
        <Save className="h-3 w-3" />
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session editor (collapsible)
// ---------------------------------------------------------------------------
function SessionEditor({
  uid,
  session,
  onUpdate,
  onDelete,
}: {
  uid: string;
  session: ProgramSession;
  onUpdate: (mutator: (s: ProgramSession) => ProgramSession) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.name);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setNameDraft(session.name);
  }, [session.name]);

  const commitName = () => {
    onUpdate((s) => ({ ...s, name: nameDraft.trim() || s.name }));
    setRenaming(false);
  };

  const moveExercise = (idx: number, dir: -1 | 1) => {
    onUpdate((s) => {
      const next = [...s.exercises];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return s;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...s, exercises: next };
    });
  };

  const updateExercise = (
    idx: number,
    patch: Partial<PlannedExercise>,
  ) =>
    onUpdate((s) => ({
      ...s,
      exercises: s.exercises.map((ex, i) =>
        i === idx ? { ...ex, ...patch } : ex,
      ),
    }));

  const removeExercise = (idx: number) =>
    onUpdate((s) => ({
      ...s,
      exercises: s.exercises.filter((_, i) => i !== idx),
    }));

  const addExercise = (picked: { id: string; name: string }) => {
    onUpdate((s) => ({
      ...s,
      exercises: [
        ...s.exercises,
        {
          exerciseId: picked.id,
          name: picked.name,
          targetSets: 3,
          repRangeLow: 8,
          repRangeHigh: 12,
          order: s.exercises.length,
        },
      ],
    }));
    setPickerOpen(false);
  };

  return (
    <div className="rounded-xl border border-border bg-neutral-900/40">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Toggle session"
          className="rounded-md p-1 text-muted hover:bg-neutral-800 hover:text-neutral-100"
        >
          <span className="block h-3 w-3 transition-transform" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
            ▶
          </span>
        </button>
        {renaming ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setNameDraft(session.name);
                  setRenaming(false);
                }
              }}
              onBlur={commitName}
              autoFocus
              maxLength={64}
              className="h-8 flex-1 rounded-md border border-border bg-neutral-900 px-2 text-sm text-neutral-100 focus:border-accent focus:outline-none"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="flex flex-1 items-center gap-2 text-left"
          >
            <span className="text-sm font-semibold text-neutral-100">
              {session.name}
            </span>
            <Pencil className="h-3 w-3 text-muted opacity-60 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {session.exercises.length} ex
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete session"
          className="rounded-md p-1.5 text-muted hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {open ? (
        <div className="space-y-2 border-t border-border px-3 py-3">
          {session.exercises.length === 0 ? (
            <p className="text-xs text-muted">
              No exercises yet. Add one below.
            </p>
          ) : (
            <ul className="space-y-2">
              {session.exercises.map((ex, idx) => (
                <ExerciseRow
                  key={`${ex.exerciseId}-${idx}`}
                  ex={ex}
                  isFirst={idx === 0}
                  isLast={idx === session.exercises.length - 1}
                  onMoveUp={() => moveExercise(idx, -1)}
                  onMoveDown={() => moveExercise(idx, 1)}
                  onChange={(patch) => updateExercise(idx, patch)}
                  onRemove={() => removeExercise(idx)}
                />
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-dashed border-border bg-transparent px-3 text-xs font-medium text-muted hover:border-accent/40 hover:bg-neutral-900 hover:text-neutral-100"
          >
            <Plus className="h-3.5 w-3.5 text-accent" />
            Add exercise
          </button>
        </div>
      ) : null}

      {pickerOpen ? (
        <ExercisePicker
          uid={uid}
          excludeIds={session.exercises.map((e) => e.exerciseId)}
          onPick={addExercise}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One exercise row inside a session
// ---------------------------------------------------------------------------
function ExerciseRow({
  ex,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onChange,
  onRemove,
}: {
  ex: PlannedExercise;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChange: (patch: Partial<PlannedExercise>) => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-md border border-border bg-neutral-900/60 p-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <button
            type="button"
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label="Move up"
            className="rounded p-0.5 text-muted hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={onMoveDown}
            aria-label="Move down"
            className="rounded p-0.5 text-muted hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>

        <div className="min-w-0 flex-1 text-sm font-medium text-neutral-100">
          {ex.name}
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove exercise"
          className="rounded-md p-1 text-muted hover:bg-red-500/10 hover:text-red-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <NumberField
          label="Sets"
          value={ex.targetSets}
          onChange={(v) => onChange({ targetSets: Math.max(1, Math.min(20, v)) })}
          min={1}
          max={20}
          step={1}
        />
        <NumberField
          label="Reps min"
          value={ex.repRangeLow}
          onChange={(v) =>
            onChange({
              repRangeLow: Math.max(1, Math.min(50, v)),
              repRangeHigh: Math.max(
                v,
                ex.repRangeHigh ?? v,
              ),
            })
          }
          min={1}
          max={50}
          step={1}
        />
        <NumberField
          label="Reps max"
          value={ex.repRangeHigh}
          onChange={(v) =>
            onChange({
              repRangeHigh: Math.max(ex.repRangeLow, Math.min(50, v)),
            })
          }
          min={1}
          max={50}
          step={1}
        />
      </div>
    </li>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label className="block">
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="mt-0.5 h-9 w-full rounded-md border border-border bg-neutral-900 px-2 text-center text-sm text-neutral-100 tabular-nums focus:border-accent focus:outline-none"
      />
    </label>
  );
}
