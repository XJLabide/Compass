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
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Dumbbell,
  Flame,
  Sun,
  Sunset,
  Moon,
  CloudSun,
  Wallet,
  ChevronRight,
} from "lucide-react";

import { useUserData } from "@/lib/data/UserDataProvider";
import {
  dailyPath,
  expensesPath,
  routinePath,
  routinesPath,
  todoPath,
  todosPath,
} from "@/lib/db/paths";
import type {
  DailyDoc,
  ExpenseDoc,
  RoutineDoc,
  TodoDoc,
} from "@/lib/db/types";
import { getFirebaseDb } from "@/lib/firebase";
import {
  computeLocalDate,
  getLocalDayOfWeek,
  getTodayScheduled,
} from "@/lib/workout/scheduling";
import { dowOfIso } from "@/lib/routines/helpers";
import {
  dayBlockLabel,
  dayBlockSubtitle,
  getAwakeProgress,
  getDayBlock,
} from "@/lib/today/timeOfDay";
import { kgToDisplay, weightUnitLabel } from "@/lib/workout/units";
import Skeleton from "@/components/ui/Skeleton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const DEFAULT_CURRENCY = "USD";

type TodoRow = { id: string; data: TodoDoc };
type RoutineRow = { id: string; data: RoutineDoc };

function addDaysIso(iso: string, delta: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + delta * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default function TodayPage() {
  const { uid, effectiveProfile, program } = useUserData();
  const tz = effectiveProfile?.timezone ?? "UTC";
  const unitSystem = effectiveProfile?.unitSystem ?? "imperial";
  const currency = effectiveProfile?.currency ?? DEFAULT_CURRENCY;

  // Live clock so the time-of-day banner ticks forward without a reload.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = useMemo(() => computeLocalDate(now, tz), [now, tz]);
  const todayDow = useMemo(() => getLocalDayOfWeek(now, tz), [now, tz]);

  const block = useMemo(() => getDayBlock(now, tz), [now, tz]);
  const awake = useMemo(
    () =>
      getAwakeProgress(now, tz, {
        wakeTime: effectiveProfile?.wakeTime,
        bedTime: effectiveProfile?.bedTime,
      }),
    [now, tz, effectiveProfile?.wakeTime, effectiveProfile?.bedTime],
  );

  // --- Subscriptions ------------------------------------------------------
  const [todos, setTodos] = useState<TodoRow[] | null>(null);
  const [routines, setRoutines] = useState<RoutineRow[] | null>(null);
  const [todayDaily, setTodayDaily] = useState<DailyDoc | null>(null);
  const [dailyLoaded, setDailyLoaded] = useState(false);
  const [todayExpenses, setTodayExpenses] = useState<ExpenseDoc[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(todosPath(uid), orderBy("createdAt", "desc")),
      (snap) =>
        setTodos(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
      () => setTodos([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(routinesPath(uid), orderBy("createdAt", "desc")),
      (snap) =>
        setRoutines(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
      () => setRoutines([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    setDailyLoaded(false);
    const unsub = onSnapshot(
      dailyPath(uid, today),
      (snap) => {
        setTodayDaily(snap.data() ?? null);
        setDailyLoaded(true);
      },
      () => setDailyLoaded(true),
    );
    return () => unsub();
  }, [uid, today]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(expensesPath(uid), where("localDate", "==", today)),
      (snap) => setTodayExpenses(snap.docs.map((d) => d.data())),
      () => setTodayExpenses([]),
    );
    return () => unsub();
  }, [uid, today]);

  // --- Derived ------------------------------------------------------------
  const scheduledSession = useMemo(
    () => getTodayScheduled(program, todayDow),
    [program, todayDow],
  );

  const todayTodos = useMemo(() => {
    const open = (todos ?? []).filter((r) => !r.data.done);
    const overdue = open.filter(
      (r) => r.data.dueDate && r.data.dueDate < today,
    );
    const dueToday = open.filter((r) => r.data.dueDate === today);
    const noDate = open.filter((r) => !r.data.dueDate);
    return { open, overdue, dueToday, noDate };
  }, [todos, today]);

  const scheduledRoutines = useMemo(() => {
    const list = (routines ?? []).filter(
      (r) => r.data.active && r.data.weekdays?.includes(todayDow),
    );
    const done = list.filter((r) => r.data.done?.[today]);
    return { list, done };
  }, [routines, todayDow, today]);

  const moneyTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of todayExpenses ?? []) {
      if (e.kind === "income") income += e.amountMinor;
      else expense += e.amountMinor;
    }
    return { income, expense, net: income - expense };
  }, [todayExpenses]);

  const checkInHasAny = useMemo(() => {
    if (!todayDaily) return false;
    return (
      todayDaily.bodyweightKg !== undefined ||
      todayDaily.sleepHours !== undefined ||
      todayDaily.calories !== undefined ||
      todayDaily.proteinG !== undefined ||
      todayDaily.waterMl !== undefined ||
      todayDaily.mood !== undefined ||
      todayDaily.steps !== undefined ||
      (todayDaily.note?.trim().length ?? 0) > 0
    );
  }, [todayDaily]);

  // --- Render -------------------------------------------------------------
  if (!uid) return null;

  const dateLabel = (() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(now);
    } catch {
      return today;
    }
  })();

  const dayTag =
    scheduledSession.kind === "session"
      ? scheduledSession.session.name
      : "Rest day";

  return (
    <section className="space-y-6">
      <header className="space-y-3 border-b border-border pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
              Today
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-neutral-100">
              {dateLabel}
            </h1>
          </div>
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
            {dayTag}
          </span>
        </div>
      </header>

      {/* Time-of-day banner */}
      <TimeOfDayBanner
        block={block}
        pct={awake.pct}
        remainingLabel={awake.remainingLabel}
        asleep={awake.asleep}
      />

      {/* Progress counters */}
      <ProgressStrip
        todosTotal={
          todayTodos.overdue.length +
          todayTodos.dueToday.length +
          todayTodos.noDate.length
        }
        todosDoneToday={
          (todos ?? []).filter((r) => r.data.done).length
        }
        routinesTotal={scheduledRoutines.list.length}
        routinesDone={scheduledRoutines.done.length}
        checkInDone={checkInHasAny}
      />

      {/* Workout */}
      <WorkoutSection
        scheduled={scheduledSession}
      />

      {/* Routines */}
      <RoutinesSection
        uid={uid}
        items={scheduledRoutines.list}
        today={today}
        loaded={routines !== null}
      />

      {/* Todos */}
      <TodosSection
        uid={uid}
        overdue={todayTodos.overdue}
        dueToday={todayTodos.dueToday}
        noDate={todayTodos.noDate}
        today={today}
        loaded={todos !== null}
      />

      {/* Money */}
      <MoneySection
        income={moneyTotals.income}
        expense={moneyTotals.expense}
        net={moneyTotals.net}
        currency={currency}
        loaded={todayExpenses !== null}
      />

      {/* Quick check-in stub */}
      <CheckInStub
        uid={uid}
        today={today}
        daily={todayDaily}
        loaded={dailyLoaded}
        unitImperial={unitSystem !== "metric"}
      />

      {/* Reflection */}
      <ReflectionBlock
        uid={uid}
        today={today}
        daily={todayDaily}
        loaded={dailyLoaded}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Time-of-day banner
// ---------------------------------------------------------------------------
function TimeOfDayBanner({
  block,
  pct,
  remainingLabel,
  asleep,
}: {
  block: ReturnType<typeof getDayBlock>;
  pct: number;
  remainingLabel: string;
  asleep: boolean;
}) {
  const Icon =
    block === "morning"
      ? Sun
      : block === "midday"
        ? CloudSun
        : block === "evening"
          ? Sunset
          : Moon;
  return (
    <div className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-neutral-100">
            {dayBlockLabel(block)} · {dayBlockSubtitle(block)}
          </div>
          <div className="text-[11px] text-muted">{remainingLabel}</div>
        </div>
      </div>
      {!asleep ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800/70">
          <div
            className="h-full bg-accent/70 transition-[width] duration-500"
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress strip
// ---------------------------------------------------------------------------
function ProgressStrip({
  todosTotal,
  todosDoneToday,
  routinesTotal,
  routinesDone,
  checkInDone,
}: {
  todosTotal: number;
  todosDoneToday: number;
  routinesTotal: number;
  routinesDone: number;
  checkInDone: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <ProgressCell
        label="Todos"
        value={`${todosDoneToday} done`}
        sub={`${todosTotal} open today`}
      />
      <ProgressCell
        label="Routines"
        value={`${routinesDone} / ${routinesTotal}`}
        sub={routinesTotal === 0 ? "none today" : "scheduled today"}
      />
      <ProgressCell
        label="Check-in"
        value={checkInDone ? "Logged" : "Pending"}
        sub={checkInDone ? "today" : "not yet"}
        tone={checkInDone ? "positive" : "neutral"}
      />
    </div>
  );
}

function ProgressCell({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "positive" | "neutral";
}) {
  const color = tone === "positive" ? "text-emerald-300" : "text-neutral-100";
  return (
    <div className="rounded-lg border border-border bg-neutral-900/40 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className={`mt-0.5 truncate text-sm font-semibold ${color}`}>
        {value}
      </div>
      <div className="truncate text-[10px] text-muted">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workout
// ---------------------------------------------------------------------------
function WorkoutSection({
  scheduled,
}: {
  scheduled: ReturnType<typeof getTodayScheduled>;
}) {
  if (scheduled.kind !== "session") {
    return (
      <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-accent" />
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            Workout
          </h2>
        </div>
        <p className="mt-2 text-sm font-semibold text-neutral-100">
          Rest day
        </p>
        <p className="mt-1 text-[11px] text-muted">
          No session scheduled today. Recovery counts.
        </p>
      </section>
    );
  }
  const s = scheduled.session;
  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <div className="flex items-center gap-2">
        <Dumbbell className="h-4 w-4 text-accent" />
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Workout
        </h2>
      </div>
      <p className="mt-2 text-base font-semibold text-neutral-100">{s.name}</p>
      <p className="mt-0.5 text-[11px] text-muted">
        {s.exercises.length} planned exercise
        {s.exercises.length === 1 ? "" : "s"}
      </p>
      <Link
        href="/workout"
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 transition hover:brightness-110"
      >
        Start session
        <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Routines (scheduled today only)
// ---------------------------------------------------------------------------
function RoutinesSection({
  uid,
  items,
  today,
  loaded,
}: {
  uid: string;
  items: RoutineRow[];
  today: string;
  loaded: boolean;
}) {
  const toggle = useCallback(
    async (row: RoutineRow) => {
      const next = { ...(row.data.done ?? {}) };
      if (next[today]) {
        delete next[today];
      } else {
        next[today] = true;
      }
      try {
        await updateDoc(routinePath(uid, row.id), {
          done: next,
          updatedAt: serverTimestamp(),
        });
      } catch {
        /* silent — full editor surfaces errors */
      }
    },
    [uid, today],
  );

  if (!loaded) {
    return <SectionSkeleton title="Routines" />;
  }
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <SectionHeader
          icon={Flame}
          title="Routines"
          right={
            <Link
              href="/todos?tab=routines"
              className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
            >
              Manage <ChevronRight className="h-3 w-3" />
            </Link>
          }
        />
        <p className="mt-2 text-[11px] text-muted">
          Nothing scheduled today.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <SectionHeader
        icon={Flame}
        title="Routines"
        right={
          <Link
            href="/todos?tab=routines"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
          >
            Manage <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />
      <ul className="mt-2 space-y-1.5">
        {items.map((row) => {
          const done = Boolean(row.data.done?.[today]);
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => toggle(row)}
                aria-pressed={done}
                className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                  done
                    ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                    : "border-border bg-neutral-900/60 text-neutral-100 hover:bg-neutral-800/60"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                ) : (
                  <Circle className="h-4 w-4 text-muted" />
                )}
                <span className="flex-1 truncate text-sm">
                  {row.data.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Todos (overdue + today, with Push-to-tomorrow)
// ---------------------------------------------------------------------------
function TodosSection({
  uid,
  overdue,
  dueToday,
  noDate,
  today,
  loaded,
}: {
  uid: string;
  overdue: TodoRow[];
  dueToday: TodoRow[];
  noDate: TodoRow[];
  today: string;
  loaded: boolean;
}) {
  const [pushOpen, setPushOpen] = useState(false);
  const [pushing, setPushing] = useState(false);

  const toggle = useCallback(
    async (row: TodoRow) => {
      try {
        await updateDoc(todoPath(uid, row.id), {
          done: !row.data.done,
          completedAt: !row.data.done ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });
      } catch {
        /* silent */
      }
    },
    [uid],
  );

  const pushToTomorrow = useCallback(async () => {
    setPushing(true);
    try {
      const db = getFirebaseDb();
      const batch = writeBatch(db);
      const tomorrow = addDaysIso(today, 1);
      // Only push items that have (or will have) a date — overdue + due today.
      // Undated todos stay undated (they aren't "today-only").
      for (const row of [...overdue, ...dueToday]) {
        batch.update(todoPath(uid, row.id), {
          dueDate: tomorrow,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setPushOpen(false);
    } catch {
      /* silent — kept inside the dialog if needed */
    } finally {
      setPushing(false);
    }
  }, [uid, today, overdue, dueToday]);

  if (!loaded) {
    return <SectionSkeleton title="Todos" />;
  }

  const total = overdue.length + dueToday.length + noDate.length;

  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <SectionHeader
        icon={ClipboardCheck}
        title="Todos"
        right={
          <Link
            href="/todos"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
          >
            Manage <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />

      {total === 0 ? (
        <p className="mt-2 text-[11px] text-muted">
          Nothing on the list. ✓
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {overdue.length > 0 || dueToday.length > 0 ? (
            <ul className="space-y-1">
              {overdue.map((r) => (
                <TodoLine
                  key={r.id}
                  row={r}
                  overdue
                  onToggle={() => toggle(r)}
                />
              ))}
              {dueToday.map((r) => (
                <TodoLine key={r.id} row={r} onToggle={() => toggle(r)} />
              ))}
            </ul>
          ) : null}

          {noDate.length > 0 ? (
            <div>
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
                No date
              </div>
              <ul className="space-y-1">
                {noDate.map((r) => (
                  <TodoLine
                    key={r.id}
                    row={r}
                    onToggle={() => toggle(r)}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {overdue.length + dueToday.length > 0 ? (
        <button
          type="button"
          onClick={() => setPushOpen(true)}
          className="mt-3 inline-flex h-8 items-center gap-1 rounded-md border border-border bg-neutral-900 px-2.5 text-[10px] font-medium text-muted hover:text-neutral-200"
        >
          Push remaining to tomorrow
          <ArrowRight className="h-3 w-3" />
        </button>
      ) : null}

      <ConfirmDialog
        open={pushOpen}
        title={`Push ${overdue.length + dueToday.length} todo${
          overdue.length + dueToday.length === 1 ? "" : "s"
        } to tomorrow?`}
        description={`Every incomplete todo with a due date through today will be moved to ${addDaysIso(today, 1)}. Undated todos stay undated.`}
        confirmLabel={`Push ${overdue.length + dueToday.length}`}
        busy={pushing}
        onConfirm={pushToTomorrow}
        onCancel={() => setPushOpen(false)}
      />
    </section>
  );
}

function TodoLine({
  row,
  overdue,
  onToggle,
}: {
  row: TodoRow;
  overdue?: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-neutral-800/40"
      >
        <Circle className="h-4 w-4 text-muted transition-colors group-hover:text-neutral-200" />
        <span className="flex-1 truncate text-sm text-neutral-100">
          {row.data.title}
        </span>
        {overdue && row.data.dueDate ? (
          <span className="shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-300">
            {row.data.dueDate}
          </span>
        ) : null}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
function MoneySection({
  income,
  expense,
  net,
  currency,
  loaded,
}: {
  income: number;
  expense: number;
  net: number;
  currency: string;
  loaded: boolean;
}) {
  if (!loaded) return <SectionSkeleton title="Money" />;
  const fmt = (minor: number) => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0,
      }).format(minor / 100);
    } catch {
      return `${(minor / 100).toFixed(0)} ${currency}`;
    }
  };
  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <SectionHeader
        icon={Wallet}
        title="Money · today"
        right={
          <Link
            href="/money"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
          >
            Open <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />
      {income === 0 && expense === 0 ? (
        <p className="mt-2 text-[11px] text-muted">
          Nothing logged today yet.
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <MoneyCell label="In" value={fmt(income)} tone="positive" />
          <MoneyCell label="Out" value={fmt(expense)} tone="negative" />
          <MoneyCell
            label="Net"
            value={fmt(net)}
            tone={net >= 0 ? "positive" : "negative"}
          />
        </div>
      )}
    </section>
  );
}

function MoneyCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative";
}) {
  const color = tone === "positive" ? "text-emerald-300" : "text-red-300";
  return (
    <div className="rounded-md border border-border bg-neutral-900/60 px-2 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick check-in stub — weight / mood / water inline
// ---------------------------------------------------------------------------
function CheckInStub({
  uid,
  today,
  daily,
  loaded,
  unitImperial,
}: {
  uid: string;
  today: string;
  daily: DailyDoc | null;
  loaded: boolean;
  unitImperial: boolean;
}) {
  if (!loaded) return <SectionSkeleton title="Check-in" />;
  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <SectionHeader
        icon={ClipboardCheck}
        title="Check-in"
        right={
          <Link
            href="/check-in"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
          >
            Full form <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <QuickField
          label={unitImperial ? "Weight (lb)" : "Weight (kg)"}
          value={
            daily?.bodyweightKg !== undefined
              ? formatNumber(
                  unitImperial
                    ? kgToDisplay(daily.bodyweightKg, "imperial")
                    : daily.bodyweightKg,
                  1,
                )
              : ""
          }
          onCommit={async (v) => {
            const num = parseFloat(v);
            if (!Number.isFinite(num) || num <= 0) return;
            const kg = unitImperial ? num / 2.20462 : num;
            await setDoc(
              dailyPath(uid, today),
              {
                localDate: today,
                bodyweightKg: Math.round(kg * 1000) / 1000,
                updatedAt: serverTimestamp(),
              } as unknown as DailyDoc,
              { merge: true },
            );
          }}
          inputMode="decimal"
          step={unitImperial ? 0.5 : 0.1}
        />
        <QuickField
          label="Water (ml)"
          value={daily?.waterMl !== undefined ? String(daily.waterMl) : ""}
          onCommit={async (v) => {
            const num = parseFloat(v);
            if (!Number.isFinite(num) || num < 0) return;
            await setDoc(
              dailyPath(uid, today),
              {
                localDate: today,
                waterMl: Math.round(num),
                updatedAt: serverTimestamp(),
              } as unknown as DailyDoc,
              { merge: true },
            );
          }}
          inputMode="numeric"
          step={100}
        />
        <MoodPicker
          value={daily?.mood}
          onPick={async (m) => {
            await setDoc(
              dailyPath(uid, today),
              {
                localDate: today,
                mood: m,
                updatedAt: serverTimestamp(),
              } as unknown as DailyDoc,
              { merge: true },
            );
          }}
        />
      </div>
    </section>
  );
}

function QuickField({
  label,
  value,
  onCommit,
  inputMode,
  step,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => Promise<void>;
  inputMode: "decimal" | "numeric";
  step: number;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="block">
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        type="number"
        inputMode={inputMode}
        step={step}
        min={0}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onCommit(v)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="mt-0.5 h-9 w-full rounded-md border border-border bg-neutral-900 px-2 text-center text-sm text-neutral-100 tabular-nums focus:border-accent focus:outline-none"
      />
    </label>
  );
}

function MoodPicker({
  value,
  onPick,
}: {
  value?: number;
  onPick: (m: number) => Promise<void>;
}) {
  const labels = ["😞", "😕", "😐", "🙂", "😄"];
  return (
    <div>
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted">
        Mood
      </span>
      <div className="mt-0.5 grid h-9 grid-cols-5 gap-0.5 rounded-md border border-border bg-neutral-900 p-0.5">
        {labels.map((emoji, i) => {
          const m = i + 1;
          const active = value === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(m)}
              aria-label={`Mood ${m}`}
              className={`flex items-center justify-center rounded text-base transition-colors ${
                active ? "bg-accent/20" : "hover:bg-neutral-800"
              }`}
            >
              {emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reflection block — struggles / wins / plan tomorrow
// ---------------------------------------------------------------------------
function ReflectionBlock({
  uid,
  today,
  daily,
  loaded,
}: {
  uid: string;
  today: string;
  daily: DailyDoc | null;
  loaded: boolean;
}) {
  if (!loaded) return <SectionSkeleton title="Reflection" />;
  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4 space-y-3">
      <SectionHeader icon={Sunset} title="Reflection" />
      <ReflectionField
        label="Current struggles"
        placeholder="What's on your mind right now?"
        value={daily?.struggles ?? ""}
        onCommit={async (v) =>
          setDoc(
            dailyPath(uid, today),
            {
              localDate: today,
              struggles: v,
              updatedAt: serverTimestamp(),
            } as unknown as DailyDoc,
            { merge: true },
          )
        }
      />
      <ReflectionField
        label="Wins & positives"
        placeholder="What went right today?"
        value={daily?.wins ?? ""}
        onCommit={async (v) =>
          setDoc(
            dailyPath(uid, today),
            {
              localDate: today,
              wins: v,
              updatedAt: serverTimestamp(),
            } as unknown as DailyDoc,
            { merge: true },
          )
        }
      />
      <ReflectionField
        label="Plan for tomorrow"
        placeholder="What's the one thing for tomorrow?"
        value={daily?.planTomorrow ?? ""}
        onCommit={async (v) =>
          setDoc(
            dailyPath(uid, today),
            {
              localDate: today,
              planTomorrow: v,
              updatedAt: serverTimestamp(),
            } as unknown as DailyDoc,
            { merge: true },
          )
        }
      />
    </section>
  );
}

function ReflectionField({
  label,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: string;
  onCommit: (v: string) => Promise<void>;
}) {
  const [v, setV] = useState(value);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(() => setV(value), [value]);

  const commit = async () => {
    if (v === value) return;
    setSaving(true);
    try {
      await onCommit(v);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
        {saving ? (
          <span className="text-[10px] text-muted">Saving…</span>
        ) : savedFlash ? (
          <span className="text-[10px] text-emerald-300">Saved</span>
        ) : null}
      </div>
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        rows={2}
        maxLength={5000}
        className="mt-1 block w-full resize-y rounded-md border border-border bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------
function SectionHeader({
  icon: Icon,
  title,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">
        {title}
      </div>
      <Skeleton className="mt-3 h-16 w-full" />
    </section>
  );
}

function formatNumber(n: number, digits: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toFixed(digits);
}
