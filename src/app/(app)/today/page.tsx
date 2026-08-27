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
  CalendarDays,
  Sun,
  Sunset,
  Moon,
  CloudSun,
  Wallet,
  ChevronRight,
  Settings2,
  X,
  Zap,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import MacroRatioChart from "@/components/checkin/MacroRatioChart";
import DatePicker, {
  backfillMinDate,
  isWithinBackfillWindow,
} from "@/components/checkin/DatePicker";
import CheckInForm from "@/components/checkin/CheckInForm";
import RoutinesTab from "@/components/todos/RoutinesTab";
import CompassLoader from "@/components/ui/CompassLoader";
import StartDayPrompt from "@/components/day/StartDayPrompt";
import { useUserData } from "@/lib/data/UserDataProvider";
import { useActiveDay } from "@/lib/day/ActiveDayProvider";
import {
  dailyPath,
  calendarItemsPath,
  expensesPath,
  routinePath,
  routinesPath,
  todoPath,
  todosPath,
} from "@/lib/db/paths";
import type {
  DailyDoc,
  CalendarItemDoc,
  ExpenseDoc,
  Profile,
  RoutineDoc,
  RoutineTimeBlock,
  TodoDoc,
} from "@/lib/db/types";
import { getFirebaseDb } from "@/lib/firebase";
import {
  getTodayScheduled,
} from "@/lib/workout/scheduling";
import {
  dowOfIso,
  groupRoutinesByBlock,
  resolveTimeBlocks,
} from "@/lib/routines/helpers";
import { BlockIcon } from "@/components/todos/TimeBlockManager";
import {
  dayBlockLabel,
  dayBlockSubtitle,
  getAwakeProgress,
  getDayBlock,
} from "@/lib/today/timeOfDay";
import { kgToDisplay, weightUnitLabel } from "@/lib/workout/units";
import Skeleton from "@/components/ui/Skeleton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const DEFAULT_CURRENCY = "PHP";

type TodoRow = { id: string; data: TodoDoc };
type RoutineRow = { id: string; data: RoutineDoc };
type CalendarRow = { id: string; data: CalendarItemDoc };

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function weekdayOf(iso: string): number {
  return parseIsoDate(iso).getUTCDay();
}

function calendarItemOccursOn(item: CalendarItemDoc, iso: string): boolean {
  if (!item.active) return false;
  const dow = weekdayOf(iso);
  if (item.type === "class") {
    if (item.startDate && iso < item.startDate) return false;
    if (item.endDate && iso > item.endDate) return false;
    return item.weekdays.includes(dow);
  }
  if (item.recurrence === "weekly") {
    return item.weekdays?.includes(dow) ?? false;
  }
  return item.date === iso;
}

function calendarTimeLabel(item: CalendarItemDoc): string {
  if (item.type === "event" && !item.startTime && !item.endTime) return "All day";
  if (item.startTime && item.endTime) return `${item.startTime} - ${item.endTime}`;
  if (item.startTime) return item.startTime;
  return "All day";
}

function addDaysIso(iso: string, delta: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + delta * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default function TodayPage() {
  const { uid, effectiveProfile, program } = useUserData();
  const {
    activeDate: today,
    actualDate,
    hasActiveDay,
    isCarriedOver,
    startDay,
    endDay,
    saving: daySaving,
    error: endDayError,
  } = useActiveDay();
  const tz = effectiveProfile?.timezone ?? "UTC";
  const unitSystem = effectiveProfile?.unitSystem ?? "imperial";
  const currency = effectiveProfile?.currency ?? DEFAULT_CURRENCY;

  const timeBlocks = useMemo(
    () => resolveTimeBlocks(effectiveProfile ?? undefined),
    [effectiveProfile],
  );

  // Live clock so the time-of-day banner ticks forward without a reload.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayDow = useMemo(() => dowOfIso(today), [today]);

  const block = useMemo(() => getDayBlock(now, tz), [now, tz]);
  const awake = useMemo(
    () =>
      getAwakeProgress(now, tz, {
        wakeTime: effectiveProfile?.wakeTime,
        bedTime: effectiveProfile?.bedTime,
      }),
    [now, tz, effectiveProfile?.wakeTime, effectiveProfile?.bedTime],
  );

  const router = useRouter();
  const searchParams = useSearchParams();

  const [showHabitManager, setShowHabitManager] = useState(false);
  const [endDayOpen, setEndDayOpen] = useState(false);
  const [showBackfillPicker, setShowBackfillPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<"execution" | "nutrition" | "checkin">("execution");

  const rawDateParam = searchParams.get("date");
  const minBackfill = useMemo(() => backfillMinDate(today), [today]);

  const activeDate = useMemo(() => {
    if (!rawDateParam || !/^\d{4}-\d{2}-\d{2}$/.test(rawDateParam)) return today;
    if (isWithinBackfillWindow(rawDateParam, today, minBackfill)) {
      return rawDateParam;
    }
    return today;
  }, [rawDateParam, today, minBackfill]);

  const handleDateChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", next);
      router.replace(`/today?${params.toString()}`);
    },
    [router, searchParams],
  );

  // --- Subscriptions ------------------------------------------------------
  const [todos, setTodos] = useState<TodoRow[] | null>(null);
  const [routines, setRoutines] = useState<RoutineRow[] | null>(null);
  const [calendarItems, setCalendarItems] = useState<CalendarRow[] | null>(null);
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
    const unsub = onSnapshot(
      query(calendarItemsPath(uid), orderBy("createdAt", "desc")),
      (snap) =>
        setCalendarItems(
          snap.docs.map((d) => ({ id: d.id, data: d.data() })),
        ),
      () => setCalendarItems([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    setDailyLoaded(false);
    const unsub = onSnapshot(
      dailyPath(uid, activeDate),
      (snap) => {
        setTodayDaily(snap.data() ?? null);
        setDailyLoaded(true);
      },
      () => setDailyLoaded(true),
    );
    return () => unsub();
  }, [uid, activeDate]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(expensesPath(uid), where("localDate", "==", activeDate)),
      (snap) => setTodayExpenses(snap.docs.map((d) => d.data())),
      () => setTodayExpenses([]),
    );
    return () => unsub();
  }, [uid, activeDate]);

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

  const scheduledCalendarItems = useMemo(
    () =>
      (calendarItems ?? [])
        .filter((row) => calendarItemOccursOn(row.data, activeDate))
        .sort((a, b) =>
          (a.data.startTime ?? "99:99").localeCompare(
            b.data.startTime ?? "99:99",
          ),
        ),
    [activeDate, calendarItems],
  );

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

  const endDayReminders = useMemo(() => {
    const reminders: string[] = [];
    const routinesLeft = scheduledRoutines.list.length - scheduledRoutines.done.length;
    const openTodos = todayTodos.overdue.length + todayTodos.dueToday.length;
    const mealsLogged =
      (todayDaily?.loggedMeals?.length ?? 0) > 0 ||
      todayDaily?.calories !== undefined ||
      todayDaily?.proteinG !== undefined;

    if (routinesLeft > 0) {
      reminders.push(
        `${routinesLeft} habit${routinesLeft === 1 ? "" : "s"} still open`,
      );
    }
    if (todayExpenses !== null && todayExpenses.length === 0) {
      reminders.push("no spending or income logged");
    }
    if (dailyLoaded && !mealsLogged) {
      reminders.push("no meals logged");
    }
    if (dailyLoaded && !checkInHasAny) {
      reminders.push("Daily Log is still empty");
    }
    if (openTodos > 0) {
      reminders.push(
        `${openTodos} dated todo${openTodos === 1 ? "" : "s"} still open`,
      );
    }
    return reminders;
  }, [
    checkInHasAny,
    dailyLoaded,
    scheduledRoutines.done.length,
    scheduledRoutines.list.length,
    todayDaily,
    todayExpenses,
    todayTodos.dueToday.length,
    todayTodos.overdue.length,
  ]);

  const handleEndDayConfirm = useCallback(async () => {
    await endDay();
    setEndDayOpen(false);
  }, [endDay]);

  // --- Render -------------------------------------------------------------
  if (!uid) return null;

  const dateLabel = (() => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "long",
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
        .formatToParts(new Date(`${activeDate}T12:00:00Z`))
        .reduce<Record<string, string>>((acc, part) => {
          if (part.type !== "literal") acc[part.type] = part.value;
          return acc;
        }, {});
      return `${parts.weekday} - ${parts.month} ${parts.day} ${parts.year}`;
    } catch {
      return activeDate;
    }
  })();

  return (
    <section className="space-y-5">
      <header className="space-y-3 border-b border-border pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium text-muted">
              {hasActiveDay ? (activeDate === today ? "Active Day" : "Backfill") : "Not Started"}
            </p>
            <h1 className="mt-0.5 text-[clamp(1.375rem,5.4vw,1.875rem)] font-semibold tracking-tight text-neutral-100">
              {dateLabel}
            </h1>
            {hasActiveDay && isCarriedOver && activeDate === today ? (
              <p className="mt-1.5 max-w-prose text-xs leading-5 text-amber-300">
                Calendar is {actualDate}. Logs still go to {today} until you end the day.
              </p>
            ) : null}
            {endDayError ? (
              <p className="mt-1 text-xs text-rose-300">{endDayError}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <button
              type="button"
              onClick={() => setShowBackfillPicker((open) => !open)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-neutral-900 px-3 text-sm font-semibold text-neutral-100 transition hover:border-neutral-600 sm:h-11 sm:px-4"
            >
              <CalendarDays className="h-4 w-4 text-muted" />
              {activeDate === today ? "Backfill" : "Change Date"}
            </button>
            {activeDate !== today ? (
              <button
                type="button"
                onClick={() => handleDateChange(today)}
                className="h-10 rounded-md border border-border bg-neutral-900 px-3 text-sm font-medium text-muted transition hover:border-neutral-600 hover:text-neutral-100 sm:h-11 sm:px-4"
              >
                Today
              </button>
            ) : null}
            {!hasActiveDay ? (
              <button
                type="button"
                onClick={() => void startDay()}
                disabled={daySaving}
                className="h-10 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:px-5"
              >
                {daySaving ? "Starting..." : "Start My Day"}
              </button>
            ) : activeDate === today ? (
              <button
                type="button"
                onClick={() => setEndDayOpen(true)}
                disabled={daySaving}
                className="h-10 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 text-sm font-semibold text-amber-100 transition hover:border-amber-400/70 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:px-5"
              >
                {daySaving ? "Ending..." : "End Day"}
              </button>
            ) : null}
          </div>
        </div>
        {showBackfillPicker || activeDate !== today ? (
          <div className="max-w-xs">
              <DatePicker
                value={activeDate}
                today={today}
                min={minBackfill}
                onPick={handleDateChange}
              />
          </div>
        ) : null}
      </header>

      {!hasActiveDay ? (
        <StartDayPrompt scope="daily logs, workouts, routines, and spending" />
      ) : null}

      {/* Time-of-day banner */}
      {hasActiveDay ? (
        <TimeOfDayBanner
          block={block}
          pct={awake.pct}
          remainingLabel={awake.remainingLabel}
          asleep={awake.asleep}
        />
      ) : null}

      {/* Unified Progress Counter */}
      {hasActiveDay ? (
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
      ) : null}

      {/* 3 Smart Focus Tabs Switcher */}
      {hasActiveDay ? (
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border p-px">
        <button
          type="button"
          onClick={() => setActiveTab("execution")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-semibold transition-colors ${
            activeTab === "execution"
              ? "bg-neutral-800 text-accent"
              : "bg-neutral-900/70 text-muted hover:text-neutral-200"
          }`}
        >
          <Zap className="h-4 w-4" />
          <span>Execution</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("nutrition")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-semibold transition-colors ${
            activeTab === "nutrition"
              ? "bg-neutral-800 text-accent"
              : "bg-neutral-900/70 text-muted hover:text-neutral-200"
          }`}
        >
          <Flame className="h-4 w-4 text-amber-400" />
          <span>Nutrition</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("checkin")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-semibold transition-colors ${
            activeTab === "checkin"
              ? "bg-neutral-800 text-accent"
              : "bg-neutral-900/70 text-muted hover:text-neutral-200"
          }`}
        >
          <ClipboardCheck className="h-4 w-4 text-cyan-400" />
          <span>Daily Log</span>
        </button>
      </div>
      ) : null}

      {/* TAB 1: EXECUTION */}
      {hasActiveDay && activeTab === "execution" && (
        <div className="space-y-6">
          <CalendarSection
            items={scheduledCalendarItems}
            loaded={calendarItems !== null}
          />
          <WorkoutSection scheduled={scheduledSession} />
          <RoutinesSection
            uid={uid}
            items={scheduledRoutines.list}
            timeBlocks={timeBlocks}
            today={activeDate}
            loaded={routines !== null}
            onManage={() => setShowHabitManager(true)}
          />
          <TodosSection
            uid={uid}
            overdue={todayTodos.overdue}
            dueToday={todayTodos.dueToday}
            noDate={todayTodos.noDate}
            today={today}
            loaded={todos !== null}
          />
          <MoneySection
            income={moneyTotals.income}
            expense={moneyTotals.expense}
            net={moneyTotals.net}
            currency={currency}
            loaded={todayExpenses !== null}
          />
        </div>
      )}

      {/* TAB 2: NUTRITION */}
      {hasActiveDay && activeTab === "nutrition" && (
        <div className="space-y-6">
          <NutritionSection
            profile={effectiveProfile}
            daily={todayDaily}
            loaded={dailyLoaded}
          />
        </div>
      )}

      {/* TAB 3: DAILY CHECK-IN */}
      {hasActiveDay && activeTab === "checkin" && (
        <div className="space-y-6">
          {effectiveProfile && (
            <section className="rounded-xl border border-border bg-neutral-900/40 p-4 space-y-4">
              <SectionHeader
                icon={ClipboardCheck}
                title="Daily Log"
              />
              <CheckInForm
                profile={effectiveProfile}
                initialLocalDate={activeDate}
                onDateChange={handleDateChange}
                hideHeader={true}
                hideDatePicker={true}
                showMealLogger={false}
              />
            </section>
          )}
        </div>
      )}

      {/* Habit Manager Modal/Drawer */}
      {showHabitManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-panel p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-semibold text-neutral-100 flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-accent" /> Manage Habits
              </h3>
              <button
                onClick={() => setShowHabitManager(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-neutral-800 hover:text-neutral-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <RoutinesTab />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={endDayOpen}
        title="End today's tracking?"
        confirmLabel={endDayReminders.length > 0 ? "End Anyway" : "End Day"}
        cancelLabel="Keep Tracking"
        busy={daySaving}
        onConfirm={() => void handleEndDayConfirm()}
        onCancel={() => setEndDayOpen(false)}
      >
        <div className="space-y-3 text-xs leading-relaxed text-muted">
          <p>
            Your saved logs stay untouched. After ending, new daily logs pause until you start your next day.
          </p>
          {endDayReminders.length > 0 ? (
            <div className="rounded-md border border-border bg-neutral-900/60 p-3">
              <p className="font-medium text-neutral-200">
                Before you close the day:
              </p>
              <ul className="mt-2 space-y-1.5">
                {endDayReminders.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden="true" className="text-accent">
                      -
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-neutral-300">
              Looks like the main daily tracking areas have something logged.
            </p>
          )}
        </div>
      </ConfirmDialog>
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
        label="Daily Log"
        value={checkInDone ? "Logged" : "Not Logged"}
        sub={checkInDone ? "saved today" : "open"}
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
// Calendar
// ---------------------------------------------------------------------------
function CalendarSection({
  items,
  loaded,
}: {
  items: CalendarRow[];
  loaded: boolean;
}) {
  if (!loaded) {
    return (
      <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <Skeleton className="h-20" />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-accent" />
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            Calendar
          </h2>
        </div>
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
        >
          Open
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No calendar events today.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.slice(0, 5).map((row) => (
            <div
              key={row.id}
              className="rounded-md border border-border bg-neutral-950/50 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-100">
                    {row.data.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {calendarTimeLabel(row.data)}
                    {row.data.location ? ` · ${row.data.location}` : ""}
                  </p>
                </div>
                {row.data.externalSource === "google_calendar" ? (
                  <span className="shrink-0 text-xs font-medium text-accent">
                    Google
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {items.length > 5 ? (
            <p className="text-xs text-muted">
              {items.length - 5} more in Calendar
            </p>
          ) : null}
        </div>
      )}
    </section>
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
  timeBlocks,
  today,
  loaded,
  onManage,
}: {
  uid: string;
  items: RoutineRow[];
  timeBlocks: RoutineTimeBlock[];
  today: string;
  loaded: boolean;
  onManage: () => void;
}) {
  const toggle = async (row: RoutineRow) => {
    const nextDone = { ...(row.data.done ?? {}) };
    if (nextDone[today]) {
      delete nextDone[today];
    } else {
      nextDone[today] = true;
    }
    await updateDoc(routinePath(uid, row.id), {
      done: nextDone,
      updatedAt: serverTimestamp(),
    });
  };

  const activeGroups = useMemo(() => {
    if (!loaded) return [];
    return groupRoutinesByBlock(items, timeBlocks).filter(
      (g) => g.routines.length > 0,
    );
  }, [items, timeBlocks, loaded]);

  if (!loaded) {
    return <SectionSkeleton title="Habits" />;
  }
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <SectionHeader
          icon={Flame}
          title="Habits"
          right={
            <button
              onClick={onManage}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
            >
              Manage <ChevronRight className="h-3 w-3" />
            </button>
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
        title="Habits"
        right={
          <button
            onClick={onManage}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
          >
            Manage <ChevronRight className="h-3 w-3" />
          </button>
        }
      />
      <div className="mt-3 space-y-4">
        {activeGroups.map(({ block, routines: blockRoutines }) => (
          <div key={block.id} className="space-y-1.5">
            <div className="flex items-center gap-1.5 px-1">
              <BlockIcon name={block.icon} className="h-3.5 w-3.5 text-accent animate-pulse-subtle" />
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {block.label}
              </h4>
            </div>
            <ul className="space-y-1.5">
              {blockRoutines.map((row) => {
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
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Nutrition Section
// ---------------------------------------------------------------------------
function NutritionSection({
  profile,
  daily,
  loaded,
}: {
  profile: Profile | null;
  daily: DailyDoc | null;
  loaded: boolean;
}) {
  const targets = useMemo(() => {
    return {
      calories: profile?.calorieTargetKcal || 2000,
      protein: profile?.proteinTargetG || 150,
      carbs: profile?.carbTargetG || 250,
      fat: profile?.fatTargetG || 70,
    };
  }, [profile]);

  const current = useMemo(() => {
    return {
      calories: daily?.calories || 0,
      protein: daily?.proteinG || 0,
      carbs: daily?.carbsG || 0,
      fat: daily?.fatG || 0,
    };
  }, [daily]);

  const calPct = targets.calories > 0 ? Math.min(100, Math.round((current.calories / targets.calories) * 100)) : 0;
  const protPct = targets.protein > 0 ? Math.min(100, Math.round((current.protein / targets.protein) * 100)) : 0;
  const carbPct = targets.carbs > 0 ? Math.min(100, Math.round((current.carbs / targets.carbs) * 100)) : 0;
  const fatPct = targets.fat > 0 ? Math.min(100, Math.round((current.fat / targets.fat) * 100)) : 0;

  if (!loaded) {
    return <SectionSkeleton title="Nutrition" />;
  }

  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <SectionHeader
        icon={Flame}
        title="Nutrition"
        right={
          <Link
            href="/nutrition"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
          >
            Open <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />
      <div className="mt-3 space-y-3">
        {/* Calories progress */}
        <div>
          <div className="flex items-baseline justify-between text-xs text-muted">
            <span className="font-semibold text-neutral-200">Calories</span>
            <span className="tabular-nums font-medium text-neutral-100">
              {current.calories} / {targets.calories} kcal
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-[width]"
              style={{ width: `${calPct}%` }}
            />
          </div>
        </div>

        <MacroRatioChart
          proteinG={current.protein}
          carbsG={current.carbs}
          fatG={current.fat}
        />

        {/* Macro Progress Bars */}
        <div className="grid grid-cols-3 gap-3">
          {/* Protein */}
          <div className="rounded-lg bg-neutral-900/40 p-2 border border-border/30">
            <div className="flex items-baseline justify-between text-[10px] text-muted">
              <span>Protein</span>
              <span className="font-semibold text-neutral-100 tabular-nums">{current.protein}/{targets.protein}g</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${protPct}%` }} />
            </div>
          </div>

          {/* Carbs */}
          <div className="rounded-lg bg-neutral-900/40 p-2 border border-border/30">
            <div className="flex items-baseline justify-between text-[10px] text-muted">
              <span>Carbs</span>
              <span className="font-semibold text-neutral-100 tabular-nums">{current.carbs}/{targets.carbs}g</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-amber-300 transition-[width]" style={{ width: `${carbPct}%` }} />
            </div>
          </div>

          {/* Fat */}
          <div className="rounded-lg bg-neutral-900/40 p-2 border border-border/30">
            <div className="flex items-baseline justify-between text-[10px] text-muted">
              <span>Fat</span>
              <span className="font-semibold text-neutral-100 tabular-nums">{current.fat}/{targets.fat}g</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-rose-400 transition-[width]" style={{ width: `${fatPct}%` }} />
            </div>
          </div>
        </div>
      </div>
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
  if (!loaded) return <SectionSkeleton title="Finances" />;
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
        title="Finances · today"
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
            label="Net Flow"
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
// Quick daily-log stub — weight / mood / water inline
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
  if (!loaded) return <SectionSkeleton title="Daily Log" />;
  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <SectionHeader
        icon={ClipboardCheck}
        title="Daily Log"
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
    <CompassLoader mode="card" size="md" label={`Loading ${title}...`} />
  );
}

function formatNumber(n: number, digits: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toFixed(digits);
}
