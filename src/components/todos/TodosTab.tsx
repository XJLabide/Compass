"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  addDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type FieldValue,
} from "firebase/firestore";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Pencil,
  Plus,
  Repeat,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { useUserData } from "@/lib/data/UserDataProvider";
import { todoPath, todosPath } from "@/lib/db/paths";
import type { TodoDoc, TodoRecurrence } from "@/lib/db/types";
import Skeleton from "@/components/ui/Skeleton";
import { computeLocalDate } from "@/lib/workout/scheduling";

type Row = { id: string; data: TodoDoc };

function addDaysIso(iso: string, delta: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + delta * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default function TodosTab() {
  const { uid, effectiveProfile } = useUserData();
  const tz = effectiveProfile?.timezone ?? "UTC";
  const today = useMemo(
    () => computeLocalDate(new Date(), tz),
    [tz],
  );

  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const [recurrence, setRecurrence] = useState<TodoRecurrence>("none");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!uid) return;
    const q = query(todosPath(uid), orderBy("createdAt", "desc"));
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

  const grouped = useMemo(() => {
    const open: Row[] = [];
    const done: Row[] = [];
    for (const r of rows ?? []) (r.data.done ? done : open).push(r);
    const overdue: Row[] = [];
    const todayItems: Row[] = [];
    const upcoming: Row[] = [];
    const noDate: Row[] = [];
    for (const r of open) {
      const due = r.data.dueDate;
      if (!due) {
        noDate.push(r);
      } else if (due < today) {
        overdue.push(r);
      } else if (due === today) {
        todayItems.push(r);
      } else {
        upcoming.push(r);
      }
    }
    return { overdue, todayItems, upcoming, noDate, done };
  }, [rows, today]);

  const handleAdd = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const t = title.trim();
      if (!t || !uid || adding) return;
      setAdding(true);
      try {
        const payload: Record<string, unknown> = {
          title: t,
          done: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (dueDate) payload.dueDate = dueDate;
        if (recurrence !== "none") payload.recurrence = recurrence;
        await addDoc(todosPath(uid), payload as unknown as TodoDoc);
        setTitle("");
        setDueDate("");
        setRecurrence("none");
        inputRef.current?.focus();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add todo");
      } finally {
        setAdding(false);
      }
    },
    [title, uid, adding, dueDate, recurrence],
  );

  const toggle = useCallback(
    async (row: Row) => {
      if (!uid) return;
      try {
        const next = !row.data.done;
        await updateDoc(todoPath(uid, row.id), {
          done: next,
          completedAt: next ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });
        if (next && row.data.recurrence && row.data.recurrence !== "none") {
          const baseDate = row.data.dueDate ?? today;
          const delta = row.data.recurrence === "daily" ? 1 : 7;
          await addDoc(todosPath(uid), {
            title: row.data.title,
            done: false,
            dueDate: addDaysIso(baseDate, delta),
            recurrence: row.data.recurrence,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          } as unknown as TodoDoc);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update");
      }
    },
    [uid, today],
  );

  const remove = useCallback(
    async (row: Row) => {
      if (!uid) return;
      try {
        await deleteDoc(todoPath(uid, row.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    },
    [uid],
  );

  const saveEdit = useCallback(
    async (
      row: Row,
      patch: { title: string; dueDate: string; recurrence: TodoRecurrence },
    ) => {
      if (!uid) return;
      const update: Record<string, string | FieldValue> = {
        title: patch.title.trim(),
        updatedAt: serverTimestamp(),
        dueDate: patch.dueDate || deleteField(),
        recurrence:
          patch.recurrence && patch.recurrence !== "none"
            ? patch.recurrence
            : deleteField(),
      };
      try {
        await updateDoc(todoPath(uid, row.id), update);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    },
    [uid],
  );

  return (
    <section className="space-y-4">
      <form
        onSubmit={handleAdd}
        className="space-y-2 rounded-xl border border-border bg-neutral-900/40 p-3"
      >
        <div className="flex items-center gap-2">
          <Plus aria-hidden className="h-5 w-5 shrink-0 text-accent" />
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task and press Enter"
            className="h-10 flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-muted focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding || title.trim().length === 0}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-neutral-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-2 py-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-muted" />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-transparent text-xs text-neutral-100 focus:outline-none"
              aria-label="Due date"
            />
          </label>
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-2 py-1.5">
            <Repeat className="h-3.5 w-3.5 text-muted" />
            <select
              value={recurrence}
              onChange={(e) =>
                setRecurrence(e.target.value as TodoRecurrence)
              }
              className="bg-transparent text-xs text-neutral-100 focus:outline-none"
              aria-label="Recurrence"
            >
              <option value="none">No repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
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
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-neutral-900/30 px-4 py-8 text-center">
          <p className="text-sm font-medium text-neutral-100">
            No todos yet.
          </p>
          <p className="mt-1 text-xs text-muted">
            Capture anything on your mind. Press Enter to add.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <GroupedList
            title="Overdue"
            tone="overdue"
            items={grouped.overdue}
            today={today}
            onToggle={toggle}
            onRemove={remove}
            onSave={saveEdit}
          />
          <GroupedList
            title="Today"
            tone="today"
            items={grouped.todayItems}
            today={today}
            onToggle={toggle}
            onRemove={remove}
            onSave={saveEdit}
          />
          <GroupedList
            title="Upcoming"
            items={grouped.upcoming}
            today={today}
            onToggle={toggle}
            onRemove={remove}
            onSave={saveEdit}
          />
          <GroupedList
            title="No date"
            items={grouped.noDate}
            today={today}
            onToggle={toggle}
            onRemove={remove}
            onSave={saveEdit}
          />
          {grouped.done.length > 0 ? (
            <div>
              <SectionDivider label="Done" count={grouped.done.length} />
              <TodoList
                items={grouped.done}
                today={today}
                onToggle={toggle}
                onRemove={remove}
                onSave={saveEdit}
              />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

interface SaveFn {
  (
    row: Row,
    patch: { title: string; dueDate: string; recurrence: TodoRecurrence },
  ): Promise<void>;
}

function GroupedList({
  title,
  items,
  today,
  tone,
  onToggle,
  onRemove,
  onSave,
}: {
  title: string;
  items: Row[];
  today: string;
  tone?: "overdue" | "today";
  onToggle: (r: Row) => void;
  onRemove: (r: Row) => void;
  onSave: SaveFn;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={
            tone === "overdue"
              ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-red-300"
              : tone === "today"
                ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-accent"
                : "text-[10px] font-semibold uppercase tracking-[0.12em] text-muted"
          }
        >
          {title}
        </span>
        <span className="text-[10px] text-muted">{items.length}</span>
      </div>
      <TodoList
        items={items}
        today={today}
        onToggle={onToggle}
        onRemove={onRemove}
        onSave={onSave}
      />
    </div>
  );
}

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-3 text-[10px] uppercase tracking-wide text-muted">
      <span>{label}</span>
      <span className="h-px flex-1 bg-border" />
      <span>{count}</span>
    </div>
  );
}

function TodoList({
  items,
  today,
  onToggle,
  onRemove,
  onSave,
}: {
  items: Row[];
  today: string;
  onToggle: (r: Row) => void;
  onRemove: (r: Row) => void;
  onSave: SaveFn;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-neutral-900/40">
      {items.map((row) => (
        <TodoRow
          key={row.id}
          row={row}
          today={today}
          onToggle={onToggle}
          onRemove={onRemove}
          onSave={onSave}
        />
      ))}
    </ul>
  );
}

function TodoRow({
  row,
  today,
  onToggle,
  onRemove,
  onSave,
}: {
  row: Row;
  today: string;
  onToggle: (r: Row) => void;
  onRemove: (r: Row) => void;
  onSave: SaveFn;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(row.data.title);
  const [draftDate, setDraftDate] = useState(row.data.dueDate ?? "");
  const [draftRec, setDraftRec] = useState<TodoRecurrence>(
    row.data.recurrence ?? "none",
  );
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraftTitle(row.data.title);
    setDraftDate(row.data.dueDate ?? "");
    setDraftRec(row.data.recurrence ?? "none");
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
  };

  const save = async () => {
    if (!draftTitle.trim()) return;
    setSaving(true);
    await onSave(row, {
      title: draftTitle,
      dueDate: draftDate,
      recurrence: draftRec,
    });
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="bg-neutral-900/60 px-3 py-3">
        <div className="space-y-2">
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            autoFocus
            className="h-10 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-2 py-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-muted" />
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="bg-transparent text-xs text-neutral-100 focus:outline-none"
              />
              {draftDate ? (
                <button
                  type="button"
                  onClick={() => setDraftDate("")}
                  aria-label="Clear date"
                  className="text-muted hover:text-neutral-200"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-2 py-1.5">
              <Repeat className="h-3.5 w-3.5 text-muted" />
              <select
                value={draftRec}
                onChange={(e) =>
                  setDraftRec(e.target.value as TodoRecurrence)
                }
                className="bg-transparent text-xs text-neutral-100 focus:outline-none"
              >
                <option value="none">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <div className="ml-auto flex gap-1.5">
              <button
                type="button"
                onClick={cancel}
                className="h-8 rounded-md border border-border bg-neutral-900 px-3 text-xs text-muted hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !draftTitle.trim()}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110 disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-neutral-800/40">
      <button
        type="button"
        onClick={() => onToggle(row)}
        aria-label={row.data.done ? "Mark as not done" : "Mark as done"}
        className="shrink-0"
      >
        {row.data.done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        ) : (
          <Circle className="h-5 w-5 text-muted transition-colors group-hover:text-neutral-200" />
        )}
      </button>
      <div
        onClick={() => onToggle(row)}
        className="min-w-0 flex-1 cursor-pointer"
      >
        <div
          className={
            row.data.done
              ? "truncate text-sm text-muted line-through"
              : "truncate text-sm text-neutral-100"
          }
        >
          {row.data.title}
        </div>
        {(row.data.dueDate || row.data.recurrence) ? (
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
            {row.data.dueDate ? (
              <span
                className={
                  !row.data.done && row.data.dueDate < today
                    ? "inline-flex items-center gap-1 text-red-300"
                    : "inline-flex items-center gap-1"
                }
              >
                <CalendarDays className="h-3 w-3" />
                {row.data.dueDate}
              </span>
            ) : null}
            {row.data.recurrence && row.data.recurrence !== "none" ? (
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3 w-3" />
                {row.data.recurrence}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          startEdit();
        }}
        aria-label="Edit todo"
        title="Edit"
        className="shrink-0 rounded-md p-1 text-muted opacity-60 transition-opacity hover:bg-neutral-800 hover:text-neutral-100 hover:opacity-100 focus-visible:opacity-100"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(row);
        }}
        aria-label="Delete todo"
        title="Delete"
        className="shrink-0 rounded-md p-1 text-muted opacity-60 transition-opacity hover:bg-red-500/10 hover:text-red-300 hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
