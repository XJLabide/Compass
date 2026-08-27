"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import clsx from "clsx";
import {
  addDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type UpdateData,
} from "firebase/firestore";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  GraduationCap,
  ListChecks,
  MapPin,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import {
  calendarItemPath,
  calendarItemsPath,
  todoPath,
  todosPath,
} from "@/lib/db/paths";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type {
  CalendarItemDoc,
  CalendarClassItemDoc,
  CalendarEventItemDoc,
  CalendarItemRecurrence,
  LocalDate,
  TodoDoc,
  TodoPriority,
} from "@/lib/db/types";
import { useUserData } from "@/lib/data/UserDataProvider";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

type CalendarRow = { id: string; data: CalendarItemDoc };
type CalendarClassRow = { id: string; data: CalendarClassItemDoc };
type CalendarEventRow = { id: string; data: CalendarEventItemDoc };
type TodoRow = { id: string; data: TodoDoc };
type AddKind = "class" | "event" | "todo";
type CalendarEditTarget =
  | { kind: "class"; row: CalendarClassRow }
  | { kind: "event"; row: CalendarEventRow }
  | { kind: "todo"; row: TodoRow };
type CalendarDeleteTarget =
  | { kind: "class" | "event"; row: CalendarRow }
  | { kind: "todo"; row: TodoRow };
type DayPreview = {
  id: string;
  kind: "class" | "event" | "todo";
  title: string;
  startTime?: string;
  done?: boolean;
};

const WEEKDAYS = [
  { short: "Sun", long: "Sunday", value: 0 },
  { short: "Mon", long: "Monday", value: 1 },
  { short: "Tue", long: "Tuesday", value: 2 },
  { short: "Wed", long: "Wednesday", value: 3 },
  { short: "Thu", long: "Thursday", value: 4 },
  { short: "Fri", long: "Friday", value: 5 },
  { short: "Sat", long: "Saturday", value: 6 },
];

const WRITE_CLOSE_GUARD_MS = 1200;

function waitForCloseGuard(write: Promise<unknown>): Promise<"done" | "pending"> {
  return Promise.race([
    write.then(() => "done" as const),
    new Promise<"pending">((resolve) => {
      window.setTimeout(() => resolve("pending"), WRITE_CLOSE_GUARD_MS);
    }),
  ]);
}

function parseIsoDate(iso: LocalDate): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

function localToday(timeZone?: string): LocalDate {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function monthAnchorFromIso(iso: LocalDate): Date {
  const date = parseIsoDate(iso);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function shiftMonth(anchor: Date, delta: number): Date {
  return new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + delta, 1),
  );
}

function formatMonth(anchor: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(anchor);
}

function formatSelectedDate(iso: LocalDate): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(parseIsoDate(iso));
}

function buildMonthCells(anchor: Date): LocalDate[] {
  const first = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1),
  );
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    return toIsoDate(date);
  });
}

function weekdayOf(iso: LocalDate): number {
  return parseIsoDate(iso).getUTCDay();
}

function isSameMonth(iso: LocalDate, anchor: Date): boolean {
  const date = parseIsoDate(iso);
  return (
    date.getUTCFullYear() === anchor.getUTCFullYear() &&
    date.getUTCMonth() === anchor.getUTCMonth()
  );
}

function inDateRange(
  iso: LocalDate,
  startDate?: LocalDate,
  endDate?: LocalDate,
): boolean {
  if (startDate && iso < startDate) return false;
  if (endDate && iso > endDate) return false;
  return true;
}

function itemOccursOn(item: CalendarItemDoc, iso: LocalDate): boolean {
  if (!item.active) return false;
  const dow = weekdayOf(iso);
  if (item.type === "class") {
    return (
      item.weekdays.includes(dow) &&
      inDateRange(iso, item.startDate, item.endDate)
    );
  }
  if (item.recurrence === "weekly") {
    return item.weekdays?.includes(dow) ?? false;
  }
  return item.date === iso;
}

function isClassItem(item: CalendarItemDoc): item is CalendarClassItemDoc {
  return item.type === "class";
}

function isEventItem(item: CalendarItemDoc): item is CalendarEventItemDoc {
  return item.type === "event";
}

function timeLabel(startTime?: string, endTime?: string): string {
  if (startTime && endTime) return `${startTime} - ${endTime}`;
  if (startTime) return startTime;
  return "All day";
}

function sortRowsByTime<T extends { data: { startTime?: string } }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const left = a.data.startTime ?? "99:99";
    const right = b.data.startTime ?? "99:99";
    return left.localeCompare(right);
  });
}

function buildDayPreviews(
  calendarRows: CalendarRow[],
  todoRows: TodoRow[],
): DayPreview[] {
  const calendarPreviews = calendarRows.map((row): DayPreview => {
    if (row.data.type === "class") {
      return {
        id: row.id,
        kind: "class",
        title: row.data.title,
        startTime: row.data.startTime,
      };
    }
    return {
      id: row.id,
      kind: "event",
      title: row.data.title,
      startTime: row.data.startTime,
    };
  });

  const todoPreviews = todoRows.map((row): DayPreview => ({
    id: row.id,
    kind: "todo",
    title: row.data.title,
    done: row.data.done,
  }));

  return [...calendarPreviews, ...todoPreviews].sort((a, b) => {
    const byTime = (a.startTime ?? "99:99").localeCompare(
      b.startTime ?? "99:99",
    );
    if (byTime !== 0) return byTime;
    const priority = { class: 0, event: 1, todo: 2 };
    return priority[a.kind] - priority[b.kind];
  });
}

function toggleWeekday(days: number[], day: number): number[] {
  if (days.includes(day)) return days.filter((d) => d !== day);
  return [...days, day].sort((a, b) => a - b);
}

function selectedWeekdayName(iso: LocalDate): string {
  return WEEKDAYS[weekdayOf(iso)]?.long ?? "Today";
}

function optionalStringField(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : deleteField();
}

export default function CalendarPage() {
  const { uid, effectiveProfile } = useUserData();
  const today = localToday(effectiveProfile?.timezone);
  const [monthAnchor, setMonthAnchor] = useState(() => monthAnchorFromIso(today));
  const [selectedDate, setSelectedDate] = useState<LocalDate>(today);
  const [items, setItems] = useState<CalendarRow[]>([]);
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CalendarEditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarDeleteTarget | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setTodos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubItems = onSnapshot(
      query(calendarItemsPath(uid), orderBy("createdAt", "desc")),
      (snap) => {
        setItems(snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    const unsubTodos = onSnapshot(
      query(todosPath(uid), orderBy("createdAt", "desc")),
      (snap) => {
        setTodos(
          snap.docs
            .map((doc) => ({ id: doc.id, data: doc.data() }))
            .filter((row) => Boolean(row.data.dueDate)),
        );
      },
      (err) => setError(err.message),
    );

    return () => {
      unsubItems();
      unsubTodos();
    };
  }, [uid]);

  const monthCells = useMemo(() => buildMonthCells(monthAnchor), [monthAnchor]);

  const selectedClasses = useMemo(
    () =>
      sortRowsByTime(
        items
          .filter(
            (row): row is CalendarClassRow =>
              isClassItem(row.data) && itemOccursOn(row.data, selectedDate),
          ),
      ),
    [items, selectedDate],
  );

  const selectedEvents = useMemo(
    () =>
      sortRowsByTime(
        items
          .filter(
            (row): row is CalendarEventRow =>
              isEventItem(row.data) && itemOccursOn(row.data, selectedDate),
          ),
      ),
    [items, selectedDate],
  );

  const selectedTodos = useMemo(
    () => todos.filter((row) => row.data.dueDate === selectedDate),
    [selectedDate, todos],
  );

  async function toggleTodo(row: TodoRow) {
    if (!uid) return;
    const next = !row.data.done;
    await updateDoc(todoPath(uid, row.id), {
      done: next,
      completedAt: next ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
  }

  async function confirmDelete() {
    if (!uid || !deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const write =
        deleteTarget.kind === "todo"
          ? deleteDoc(todoPath(uid, deleteTarget.row.id))
          : deleteDoc(calendarItemPath(uid, deleteTarget.row.id));
      const result = await waitForCloseGuard(write);
      setDeleteTarget(null);
      if (result === "pending") {
        void write.catch((err) => {
          console.error("Calendar delete failed after dialog closed", err);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
      return;
    } finally {
      if (deleteTarget) setDeleting(false);
    }
  }

  function goToToday() {
    setSelectedDate(today);
    setMonthAnchor(monthAnchorFromIso(today));
  }

  return (
    <section className="flex w-full flex-col gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Planning
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-100 md:text-4xl">
            My Calendar
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthAnchor((current) => shiftMonth(current, -1))}
            aria-label="Previous month"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-neutral-950 text-muted hover:text-neutral-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="h-10 rounded-md border border-border bg-neutral-950 px-4 text-sm font-semibold text-neutral-200 hover:text-neutral-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setMonthAnchor((current) => shiftMonth(current, 1))}
            aria-label="Next month"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-neutral-950 text-muted hover:text-neutral-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="calendar-add-button"
            onClick={() => setModalOpen(true)}
            className="ml-0 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-black hover:bg-accent/90 sm:ml-2"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-panel/80 p-3 shadow-sm md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-neutral-100">
              {formatMonth(monthAnchor)}
            </h2>
            <p className="text-sm text-muted">
              Classes, events, and due-date todos
            </p>
          </div>
          <Legend />
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted md:gap-2">
          {WEEKDAYS.map((day) => (
            <div key={day.value} className="py-2">
              {day.short}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {monthCells.map((iso) => {
            const dayItems = items.filter((row) => itemOccursOn(row.data, iso));
            const dayTodos = todos.filter((row) => row.data.dueDate === iso);
            const previews = buildDayPreviews(dayItems, dayTodos);
            const firstTwo = previews.slice(0, 2);
            const desktopThird = previews[2];
            const mobileOverflow = Math.max(0, previews.length - 2);
            const desktopOverflow = Math.max(0, previews.length - 3);
            const selected = selectedDate === iso;
            const currentMonth = isSameMonth(iso, monthAnchor);
            const isToday = today === iso;

            return (
              <button
                key={iso}
                type="button"
                data-testid={`calendar-day-${iso}`}
                onClick={() => setSelectedDate(iso)}
                aria-pressed={selected}
                className={clsx(
                  "flex h-[5.75rem] min-w-0 flex-col rounded-md border p-1.5 text-left transition sm:h-[6.75rem] sm:p-2 md:h-[7.75rem] lg:h-[8.5rem]",
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-border bg-neutral-950/45 hover:border-neutral-600 hover:bg-neutral-900/70",
                  !currentMonth && "opacity-40",
                )}
              >
                <span
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold",
                    isToday && !selected && "bg-neutral-800 text-neutral-100",
                    selected && "bg-accent text-black",
                    !isToday && !selected && "text-neutral-200",
                  )}
                >
                  {Number(iso.slice(-2))}
                </span>
                <span className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                  {firstTwo.map((preview) => (
                    <DayPreviewChip key={`${preview.kind}-${preview.id}`} preview={preview} />
                  ))}
                  {desktopThird ? (
                    <DayPreviewChip
                      preview={desktopThird}
                      className="hidden md:flex"
                    />
                  ) : null}
                  {mobileOverflow > 0 ? (
                    <OverflowChip count={mobileOverflow} className="md:hidden" />
                  ) : null}
                  {desktopOverflow > 0 ? (
                    <OverflowChip
                      count={desktopOverflow}
                      className="hidden md:flex"
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        data-testid="selected-day-agenda"
        className="rounded-lg border border-border bg-panel/80 p-4 md:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Selected day
            </p>
            <h2 className="mt-1 text-2xl font-bold text-neutral-100">
              {formatSelectedDate(selectedDate)}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-4 text-sm font-semibold text-accent hover:bg-accent/15"
          >
            <Plus className="h-4 w-4" />
            Add to day
          </button>
        </div>

        {loading ? (
          <div className="mt-5 rounded-md bg-neutral-900/70 p-4 text-sm text-muted">
            Loading calendar...
          </div>
        ) : selectedClasses.length === 0 &&
          selectedEvents.length === 0 &&
          selectedTodos.length === 0 ? (
          <div className="mt-5 rounded-md border border-dashed border-border bg-neutral-950/40 p-6 text-center">
            <CalendarDays className="mx-auto h-7 w-7 text-muted" />
            <p className="mt-3 text-base font-semibold text-neutral-200">
              Nothing scheduled
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-black"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {selectedClasses.length > 0 ? (
              <AgendaGroup title="Classes">
                {selectedClasses.map((row) => (
                  <AgendaItem
                    key={row.id}
                    kind="class"
                    title={row.data.title}
                    time={timeLabel(row.data.startTime, row.data.endTime)}
                    location={row.data.location}
                    onEdit={() => setEditTarget({ kind: "class", row })}
                    onDelete={() => setDeleteTarget({ kind: "class", row })}
                  />
                ))}
              </AgendaGroup>
            ) : null}

            {selectedEvents.length > 0 ? (
              <AgendaGroup title="Events">
                {selectedEvents.map((row) => (
                  <AgendaItem
                    key={row.id}
                    kind="event"
                    title={row.data.title}
                    time={timeLabel(row.data.startTime, row.data.endTime)}
                    location={row.data.location}
                    onEdit={() => setEditTarget({ kind: "event", row })}
                    onDelete={() => setDeleteTarget({ kind: "event", row })}
                  />
                ))}
              </AgendaGroup>
            ) : null}

            {selectedTodos.length > 0 ? (
              <AgendaGroup title="Todos">
                {selectedTodos.map((row) => (
                  <div
                    key={row.id}
                    className="flex w-full items-center gap-3 rounded-md border border-border bg-neutral-950/50 p-3 text-left"
                  >
                    <button
                      type="button"
                      data-testid={`calendar-todo-toggle-${row.data.title}`}
                      aria-label={`Toggle ${row.data.title}`}
                      aria-pressed={row.data.done}
                      onClick={() => void toggleTodo(row)}
                      className={clsx(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                        row.data.done
                          ? "border-accent bg-accent text-black"
                          : "border-neutral-600 text-transparent",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-0 flex-1">
                      <span
                        className={clsx(
                          "block truncate text-sm font-semibold text-neutral-100",
                          row.data.done && "text-muted line-through",
                        )}
                      >
                        {row.data.title}
                      </span>
                      <span className="text-xs text-muted">
                        Due {selectedDate}
                        {row.data.priority ? ` · ${row.data.priority}` : ""}
                      </span>
                    </span>
                    <RowActions
                      label={row.data.title}
                      onEdit={() => setEditTarget({ kind: "todo", row })}
                      onDelete={() => setDeleteTarget({ kind: "todo", row })}
                    />
                  </div>
                ))}
              </AgendaGroup>
            ) : null}
          </div>
        )}
      </section>

      {modalOpen && uid ? (
        <AddCalendarModal
          uid={uid}
          selectedDate={selectedDate}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
      {editTarget && uid ? (
        <AddCalendarModal
          uid={uid}
          selectedDate={selectedDate}
          editTarget={editTarget}
          onClose={() => setEditTarget(null)}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget ? `Delete ${deleteTarget.kind}?` : "Delete calendar item?"
        }
        description={
          deleteTarget
            ? `This will remove "${deleteTarget.row.data.title}" from your calendar.`
            : undefined
        }
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </section>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
      <span className="inline-flex items-center gap-1.5">
        <Indicator kind="class" /> Class
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Indicator kind="event" /> Event
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Indicator kind="todo" /> Todo
      </span>
    </div>
  );
}

function Indicator({ kind }: { kind: "class" | "event" | "todo" }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "h-2 w-2 rounded-full",
        kind === "class" && "bg-sky-400",
        kind === "event" && "bg-amber-400",
        kind === "todo" && "bg-emerald-400",
      )}
    />
  );
}

function DayPreviewChip({
  preview,
  className,
}: {
  preview: DayPreview;
  className?: string;
}) {
  const Icon =
    preview.kind === "class"
      ? GraduationCap
      : preview.kind === "event"
        ? CalendarDays
        : ListChecks;

  return (
    <span
      title={preview.title}
      data-testid={`calendar-preview-${preview.title}`}
      className={clsx(
        "min-w-0 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold leading-5",
        "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]",
        preview.kind === "class" && "bg-sky-500/25 text-sky-200",
        preview.kind === "event" && "bg-amber-500/25 text-amber-200",
        preview.kind === "todo" &&
          (preview.done
            ? "bg-emerald-500/10 text-emerald-300/70 line-through"
            : "bg-emerald-500/20 text-emerald-200"),
        className ?? "flex",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="hidden min-w-0 truncate min-[390px]:inline">
        {preview.title}
      </span>
    </span>
  );
}

function OverflowChip({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "min-w-0 items-center rounded-full bg-neutral-800/80 px-1.5 text-[10px] font-semibold leading-5 text-muted",
        className ?? "flex",
      )}
    >
      +{count}
    </span>
  );
}

function AgendaGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-muted">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AgendaItem({
  kind,
  title,
  time,
  location,
  onEdit,
  onDelete,
}: {
  kind: "class" | "event";
  title: string;
  time: string;
  location?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = kind === "class" ? GraduationCap : CalendarDays;
  return (
    <div className="flex gap-3 rounded-md border border-border bg-neutral-950/50 p-3">
      <div
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
          kind === "class" ? "bg-sky-400/12 text-sky-300" : "bg-amber-400/12 text-amber-300",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-100">
          {title}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" />
            {time}
          </span>
          {location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {location}
            </span>
          ) : null}
        </div>
      </div>
      <RowActions label={title} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function RowActions({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label={`Edit ${label}`}
        data-testid={`calendar-edit-${label}`}
        onClick={onEdit}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-neutral-800 hover:text-neutral-100"
      >
        <Edit3 className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={`Delete ${label}`}
        data-testid={`calendar-delete-${label}`}
        onClick={onDelete}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-red-500/10 hover:text-red-300"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddCalendarModal({
  uid,
  selectedDate,
  editTarget,
  onClose,
}: {
  uid: string;
  selectedDate: LocalDate;
  editTarget?: CalendarEditTarget;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  const isEditing = Boolean(editTarget);
  const selectedDow = weekdayOf(selectedDate);
  const initialKind = editTarget?.kind ?? "event";
  const initialItem =
    editTarget?.kind === "class" || editTarget?.kind === "event"
      ? editTarget.row.data
      : null;
  const initialTodo = editTarget?.kind === "todo" ? editTarget.row.data : null;
  const [kind, setKind] = useState<AddKind>(initialKind);
  const [title, setTitle] = useState(initialItem?.title ?? initialTodo?.title ?? "");
  const [classWeekdays, setClassWeekdays] = useState<number[]>(
    editTarget?.kind === "class" ? editTarget.row.data.weekdays : [selectedDow],
  );
  const [eventWeekdays, setEventWeekdays] = useState<number[]>(
    editTarget?.kind === "event" && editTarget.row.data.weekdays
      ? editTarget.row.data.weekdays
      : [selectedDow],
  );
  const [startTime, setStartTime] = useState(
    initialItem?.startTime ?? "09:00",
  );
  const [endTime, setEndTime] = useState(initialItem?.endTime ?? "10:15");
  const [location, setLocation] = useState(initialItem?.location ?? "");
  const [termStart, setTermStart] = useState(
    editTarget?.kind === "class" ? editTarget.row.data.startDate ?? "" : "",
  );
  const [termEnd, setTermEnd] = useState(
    editTarget?.kind === "class" ? editTarget.row.data.endDate ?? "" : "",
  );
  const [eventDate, setEventDate] = useState(
    editTarget?.kind === "event"
      ? editTarget.row.data.date ?? selectedDate
      : selectedDate,
  );
  const [eventRecurrence, setEventRecurrence] =
    useState<CalendarItemRecurrence>(
      editTarget?.kind === "event" ? editTarget.row.data.recurrence : "none",
    );
  const [todoDueDate, setTodoDueDate] = useState(
    initialTodo?.dueDate ?? selectedDate,
  );
  const [priority, setPriority] = useState<TodoPriority | "none">(
    initialTodo?.priority ?? "none",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;

    setSaving(true);
    setError(null);
    try {
      let write: Promise<unknown>;
      if (kind === "class") {
        const editPayload = {
          type: "class",
          title: trimmedTitle,
          weekdays: classWeekdays.length > 0 ? classWeekdays : [selectedDow],
          startTime,
          endTime,
          location: optionalStringField(location),
          startDate: termStart || deleteField(),
          endDate: termEnd || deleteField(),
          active: true,
          updatedAt: serverTimestamp(),
        };
        if (editTarget?.kind === "class") {
          write = updateDoc(calendarItemPath(uid, editTarget.row.id), editPayload);
        } else {
          write = addDoc(calendarItemsPath(uid), {
            type: "class",
            title: trimmedTitle,
            weekdays: classWeekdays.length > 0 ? classWeekdays : [selectedDow],
            startTime,
            endTime,
            ...(location.trim() ? { location: location.trim() } : {}),
            ...(termStart ? { startDate: termStart } : {}),
            ...(termEnd ? { endDate: termEnd } : {}),
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          } as unknown as CalendarItemDoc);
        }
      } else if (kind === "event") {
        const editPayload = {
          type: "event",
          title: trimmedTitle,
          recurrence: eventRecurrence,
          date: eventRecurrence === "none" ? eventDate : deleteField(),
          weekdays:
            eventRecurrence === "weekly"
              ? eventWeekdays.length > 0
                ? eventWeekdays
                : [selectedDow]
              : deleteField(),
          startTime: startTime || deleteField(),
          endTime: endTime || deleteField(),
          location: optionalStringField(location),
          active: true,
          updatedAt: serverTimestamp(),
        };
        if (editTarget?.kind === "event") {
          write = updateDoc(calendarItemPath(uid, editTarget.row.id), editPayload);
        } else {
          write = addDoc(calendarItemsPath(uid), {
            type: "event",
            title: trimmedTitle,
            recurrence: eventRecurrence,
            ...(eventRecurrence === "none"
              ? { date: eventDate }
              : {
                  weekdays:
                    eventWeekdays.length > 0 ? eventWeekdays : [selectedDow],
                }),
            ...(startTime ? { startTime } : {}),
            ...(endTime ? { endTime } : {}),
            ...(location.trim() ? { location: location.trim() } : {}),
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          } as unknown as CalendarItemDoc);
        }
      } else {
        const payload: UpdateData<TodoDoc> = {
          title: trimmedTitle,
          dueDate: todoDueDate,
          updatedAt: serverTimestamp(),
        };
        payload.priority = priority !== "none" ? priority : deleteField();
        if (editTarget?.kind === "todo") {
          write = updateDoc(todoPath(uid, editTarget.row.id), payload);
        } else {
          write = addDoc(todosPath(uid), {
            ...payload,
            done: false,
            createdAt: serverTimestamp(),
          } as unknown as TodoDoc);
        }
      }
      const result = await waitForCloseGuard(write);
      onClose();
      if (result === "pending") {
        void write.catch((err) => {
          console.error("Calendar save failed after modal closed", err);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Edit calendar item" : "Add calendar item"}
      data-testid="calendar-add-modal"
      className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm md:items-center md:justify-center md:p-6"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="flex h-dvh w-full flex-col border-border bg-panel shadow-2xl md:h-auto md:max-h-[88vh] md:max-w-xl md:rounded-lg md:border"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:px-5 md:pt-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {formatSelectedDate(selectedDate)}
            </p>
            <h2 className="mt-1 text-xl font-bold text-neutral-100">
              {isEditing ? "Edit calendar item" : "Add to calendar"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-neutral-800 hover:text-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
          <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-neutral-950/60 p-1">
            {(["class", "event", "todo"] as AddKind[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  if (!isEditing) setKind(value);
                }}
                disabled={isEditing && kind !== value}
                className={clsx(
                  "h-10 rounded text-sm font-semibold capitalize transition",
                  kind === value
                    ? "bg-accent text-black"
                    : "text-muted hover:bg-neutral-800 hover:text-neutral-100",
                  isEditing && kind !== value && "cursor-not-allowed opacity-40",
                )}
              >
                {value}
              </button>
            ))}
          </div>

          {error ? (
            <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-neutral-200">
                Title
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                autoFocus
                placeholder={
                  kind === "class"
                    ? "Biology lecture"
                    : kind === "event"
                      ? "Study group"
                      : "Submit assignment"
                }
                className="mt-2 h-11 w-full rounded-md border border-border bg-neutral-950 px-3 text-base text-neutral-100 outline-none focus:border-accent"
              />
            </label>

            {kind === "class" ? (
              <>
                <WeekdayPicker
                  label="Repeats on"
                  days={classWeekdays}
                  onChange={setClassWeekdays}
                  help={`Defaulted to ${selectedWeekdayName(selectedDate)}.`}
                />
                <TimeFields
                  startTime={startTime}
                  endTime={endTime}
                  setStartTime={setStartTime}
                  setEndTime={setEndTime}
                />
                <LocationField value={location} onChange={setLocation} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DateField
                    label="Term start"
                    value={termStart}
                    onChange={setTermStart}
                    optional
                  />
                  <DateField
                    label="Term end"
                    value={termEnd}
                    onChange={setTermEnd}
                    optional
                  />
                </div>
              </>
            ) : null}

            {kind === "event" ? (
              <>
                <label className="block">
                  <span className="text-sm font-semibold text-neutral-200">
                    Event type
                  </span>
                  <select
                    value={eventRecurrence}
                    onChange={(event) =>
                      setEventRecurrence(
                        event.target.value as CalendarItemRecurrence,
                      )
                    }
                    className="mt-2 h-11 w-full rounded-md border border-border bg-neutral-950 px-3 text-base text-neutral-100 outline-none focus:border-accent"
                  >
                    <option value="none">One-off event</option>
                    <option value="weekly">Weekly event</option>
                  </select>
                </label>
                {eventRecurrence === "none" ? (
                  <DateField
                    label="Date"
                    value={eventDate}
                    onChange={setEventDate}
                  />
                ) : (
                  <WeekdayPicker
                    label="Repeats on"
                    days={eventWeekdays}
                    onChange={setEventWeekdays}
                    help={`Defaulted to ${selectedWeekdayName(selectedDate)}.`}
                  />
                )}
                <TimeFields
                  startTime={startTime}
                  endTime={endTime}
                  setStartTime={setStartTime}
                  setEndTime={setEndTime}
                  optional
                />
                <LocationField value={location} onChange={setLocation} />
              </>
            ) : null}

            {kind === "todo" ? (
              <>
                <DateField
                  label="Due date"
                  value={todoDueDate}
                  onChange={setTodoDueDate}
                />
                <label className="block">
                  <span className="text-sm font-semibold text-neutral-200">
                    Priority
                  </span>
                  <select
                    value={priority}
                    onChange={(event) =>
                      setPriority(event.target.value as TodoPriority | "none")
                    }
                    className="mt-2 h-11 w-full rounded-md border border-border bg-neutral-950 px-3 text-base text-neutral-100 outline-none focus:border-accent"
                  >
                    <option value="none">No priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 md:px-5 md:pb-5">
          <button
            type="submit"
            data-testid="calendar-create-submit"
            disabled={saving || !title.trim()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent text-base font-bold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : isEditing ? "Save changes" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}

function WeekdayPicker({
  label,
  days,
  onChange,
  help,
}: {
  label: string;
  days: number[];
  onChange: (days: number[]) => void;
  help?: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-neutral-200">{label}</legend>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((day) => {
          const active = days.includes(day.value);
          return (
            <button
              key={day.value}
              type="button"
              aria-pressed={active}
              aria-label={day.long}
              onClick={() => onChange(toggleWeekday(days, day.value))}
              className={clsx(
                "h-10 rounded-md border text-xs font-bold transition",
                active
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-neutral-950 text-muted hover:text-neutral-100",
              )}
            >
              {day.short}
            </button>
          );
        })}
      </div>
      {help ? <p className="mt-2 text-xs text-muted">{help}</p> : null}
    </fieldset>
  );
}

function TimeFields({
  startTime,
  endTime,
  setStartTime,
  setEndTime,
  optional = false,
}: {
  startTime: string;
  endTime: string;
  setStartTime: (value: string) => void;
  setEndTime: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="text-sm font-semibold text-neutral-200">
          Start time{optional ? " optional" : ""}
        </span>
        <input
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          required={!optional}
          className="mt-2 h-11 w-full rounded-md border border-border bg-neutral-950 px-3 text-base text-neutral-100 outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-neutral-200">
          End time{optional ? " optional" : ""}
        </span>
        <input
          type="time"
          value={endTime}
          onChange={(event) => setEndTime(event.target.value)}
          required={!optional}
          className="mt-2 h-11 w-full rounded-md border border-border bg-neutral-950 px-3 text-base text-neutral-100 outline-none focus:border-accent"
        />
      </label>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-neutral-200">
        {label}
        {optional ? " optional" : ""}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={!optional}
        className="mt-2 h-11 w-full rounded-md border border-border bg-neutral-950 px-3 text-base text-neutral-100 outline-none focus:border-accent"
      />
    </label>
  );
}

function LocationField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-neutral-200">
        Location optional
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Room, building, or link"
        className="mt-2 h-11 w-full rounded-md border border-border bg-neutral-950 px-3 text-base text-neutral-100 outline-none focus:border-accent"
      />
    </label>
  );
}
