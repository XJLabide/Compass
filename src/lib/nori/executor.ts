"use client";

import {
  addDoc,
  deleteField,
  getDoc,
  getDocs,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";

import {
  dailyCollectionPath,
  dailyPath,
  expensesPath,
  routinePath,
  routinesPath,
  sessionsPath,
  todoPath,
  todosPath,
} from "@/lib/db/paths";
import type {
  DailyDoc,
  ExpenseDoc,
  RoutineDoc,
  SessionDoc,
  TodoDoc,
} from "@/lib/db/types";
import {
  computeStreak,
  computeBestStreak,
  dowOfIso,
} from "@/lib/routines/helpers";
import { computeLocalDate } from "@/lib/workout/scheduling";
import { lbToKg } from "@/lib/workout/units";
import { findTool } from "@/lib/nori/tools";

/**
 * Executes a tool call from Nori. Returns a string suitable for posting back
 * as a `tool` message — that string is what the LLM sees on its next turn.
 *
 * Reads run automatically. Write tools are gated by `confirmed: true` on the
 * call site (the chat UI flips this when the user clicks confirm). If a write
 * tool is invoked without confirmation, the executor returns a string telling
 * the LLM the user declined.
 */
export interface ToolCallInput {
  name: string;
  arguments: string; // raw JSON from the LLM
  /** `true` when the user confirmed a write, or auto-true for reads. */
  confirmed: boolean;
}

export interface ToolContext {
  uid: string;
  db: Firestore;
  timezone: string;
  unitImperial: boolean;
  currency: string;
}

interface ParsedArgs {
  [k: string]: unknown;
}

function safeParseArgs(raw: string): ParsedArgs {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as ParsedArgs)
      : {};
  } catch {
    return {};
  }
}

function today(ctx: ToolContext): string {
  return computeLocalDate(new Date(), ctx.timezone);
}

function addDaysIso(iso: string, delta: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + delta * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export async function executeTool(
  ctx: ToolContext,
  call: ToolCallInput,
): Promise<string> {
  const def = findTool(call.name);
  if (!def) {
    return JSON.stringify({
      ok: false,
      error: `Unknown tool '${call.name}'.`,
    });
  }

  if (def.isWrite && !call.confirmed) {
    return JSON.stringify({
      ok: false,
      error: "User declined the write action.",
    });
  }

  const args = safeParseArgs(call.arguments);

  try {
    switch (call.name) {
      case "list_todos":
        return await listTodos(ctx, args);
      case "list_routines":
        return await listRoutines(ctx, args);
      case "list_expenses":
        return await listExpenses(ctx, args);
      case "get_check_in":
        return await getCheckIn(ctx, args);
      case "list_recent_workouts":
        return await listRecentWorkouts(ctx, args);
      case "summary":
        return await summary(ctx, args);

      case "add_todo":
        return await addTodo(ctx, args);
      case "complete_todo":
        return await completeTodo(ctx, args);
      case "add_expense":
        return await addExpense(ctx, args);
      case "add_routine":
        return await addRoutine(ctx, args);
      case "check_routine":
        return await checkRoutine(ctx, args);
      case "log_check_in":
        return await logCheckIn(ctx, args);

      default:
        return JSON.stringify({
          ok: false,
          error: `Tool '${call.name}' has no executor.`,
        });
    }
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : "Tool execution failed.",
    });
  }
}

// ---------------------------------------------------------------------------
// READ executors
// ---------------------------------------------------------------------------

async function listTodos(ctx: ToolContext, args: ParsedArgs): Promise<string> {
  const status = (args.status as string) ?? "open";
  const max = Math.min(200, Math.max(1, Number(args.limit ?? 50)));
  const snap = await getDocs(
    query(todosPath(ctx.uid), orderBy("createdAt", "desc"), fbLimit(max)),
  );
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const filtered =
    status === "all"
      ? all
      : status === "done"
        ? all.filter((t) => t.done)
        : all.filter((t) => !t.done);
  return JSON.stringify({
    ok: true,
    count: filtered.length,
    todos: filtered.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      dueDate: t.dueDate ?? null,
      recurrence: t.recurrence ?? null,
    })),
  });
}

async function listRoutines(
  ctx: ToolContext,
  _args: ParsedArgs,
): Promise<string> {
  const t = today(ctx);
  const dow = dowOfIso(t);
  const snap = await getDocs(
    query(routinesPath(ctx.uid), orderBy("createdAt", "desc")),
  );
  const items = snap.docs.map((d) => {
    const data = d.data() as RoutineDoc;
    return {
      id: d.id,
      name: data.name,
      weekdays: data.weekdays,
      active: data.active,
      scheduledToday: data.weekdays?.includes(dow) ?? false,
      doneToday: Boolean(data.done?.[t]),
      streak: computeStreak(data, t),
      best: computeBestStreak(data),
    };
  });
  return JSON.stringify({ ok: true, count: items.length, routines: items });
}

async function listExpenses(
  ctx: ToolContext,
  args: ParsedArgs,
): Promise<string> {
  const t = today(ctx);
  const monthArg = (args.month as string) ?? t.slice(0, 7);
  // Allow YYYY-MM-DD to scope to a single day.
  const isFullDate = /^\d{4}-\d{2}-\d{2}$/.test(monthArg);
  const monthPrefix = monthArg.slice(0, 7);
  const startDate = isFullDate ? monthArg : `${monthPrefix}-01`;
  const endDate = isFullDate ? monthArg : `${monthPrefix}-31`;
  const kind = (args.kind as string) ?? "all";

  const snap = await getDocs(
    query(
      expensesPath(ctx.uid),
      where("localDate", ">=", startDate),
      where("localDate", "<=", endDate),
      orderBy("localDate", "desc"),
    ),
  );
  const rows = snap.docs
    .map((d) => d.data() as ExpenseDoc)
    .filter((e) => (kind === "all" ? true : e.kind === kind));
  return JSON.stringify({
    ok: true,
    count: rows.length,
    currency: ctx.currency,
    expenses: rows.map((e) => ({
      amount: e.amountMinor / 100,
      currency: e.currency,
      kind: e.kind,
      category: e.category,
      note: e.note ?? null,
      date: e.localDate,
    })),
  });
}

async function getCheckIn(
  ctx: ToolContext,
  args: ParsedArgs,
): Promise<string> {
  const date = (args.date as string) ?? today(ctx);
  const snap = await getDoc(dailyPath(ctx.uid, date));
  if (!snap.exists()) {
    return JSON.stringify({ ok: true, found: false, date });
  }
  const d = snap.data() as DailyDoc;
  const bodyweightDisplay =
    d.bodyweightKg !== undefined
      ? ctx.unitImperial
        ? d.bodyweightKg * 2.20462
        : d.bodyweightKg
      : undefined;
  return JSON.stringify({
    ok: true,
    found: true,
    date,
    unit: ctx.unitImperial ? "lb" : "kg",
    bodyweight: bodyweightDisplay,
    sleepHours: d.sleepHours,
    sleepQuality: d.sleepQuality,
    calories: d.calories,
    proteinG: d.proteinG,
    waterMl: d.waterMl,
    steps: d.steps,
    mood: d.mood,
    note: d.note,
    struggles: d.struggles,
    wins: d.wins,
    planTomorrow: d.planTomorrow,
  });
}

async function listRecentWorkouts(
  ctx: ToolContext,
  args: ParsedArgs,
): Promise<string> {
  const max = Math.min(20, Math.max(1, Number(args.limit ?? 5)));
  const snap = await getDocs(
    query(sessionsPath(ctx.uid), orderBy("date", "desc"), fbLimit(max)),
  );
  const items = snap.docs.map((d) => {
    const s = d.data() as SessionDoc;
    return {
      id: d.id,
      name: s.name,
      date: s.localDate,
      status: s.status ?? "completed",
      setCount: s.sets?.length ?? 0,
    };
  });
  return JSON.stringify({ ok: true, count: items.length, sessions: items });
}

async function summary(ctx: ToolContext, args: ParsedArgs): Promise<string> {
  const scope = (args.scope as string) ?? "today";
  const t = today(ctx);
  let start = t;
  if (scope === "week") start = addDaysIso(t, -6);
  if (scope === "month") start = `${t.slice(0, 7)}-01`;

  // Pull each domain in parallel; cap aggressively.
  const [todosSnap, routinesSnap, expensesSnap, dailySnap, sessionsSnap] =
    await Promise.all([
      getDocs(
        query(todosPath(ctx.uid), orderBy("createdAt", "desc"), fbLimit(50)),
      ),
      getDocs(query(routinesPath(ctx.uid), orderBy("createdAt", "desc"))),
      getDocs(
        query(
          expensesPath(ctx.uid),
          where("localDate", ">=", start),
          where("localDate", "<=", t),
          orderBy("localDate", "desc"),
        ),
      ),
      getDocs(
        query(
          dailyCollectionPath(ctx.uid),
          where("localDate", ">=", start),
          where("localDate", "<=", t),
          orderBy("localDate", "desc"),
        ),
      ),
      getDocs(
        query(sessionsPath(ctx.uid), orderBy("date", "desc"), fbLimit(10)),
      ),
    ]);

  const todos = todosSnap.docs.map((d) => d.data() as TodoDoc);
  const openTodos = todos.filter((t) => !t.done).length;
  const overdue = todos.filter(
    (td) => !td.done && td.dueDate && td.dueDate < t,
  ).length;

  const dow = dowOfIso(t);
  let routinesScheduled = 0;
  let routinesDone = 0;
  for (const doc of routinesSnap.docs) {
    const r = doc.data() as RoutineDoc;
    if (!r.active) continue;
    if (!r.weekdays?.includes(dow)) continue;
    routinesScheduled += 1;
    if (r.done?.[t]) routinesDone += 1;
  }

  let income = 0;
  let expense = 0;
  for (const doc of expensesSnap.docs) {
    const e = doc.data() as ExpenseDoc;
    if (e.kind === "income") income += e.amountMinor;
    else expense += e.amountMinor;
  }

  const dailyCount = dailySnap.docs.length;
  const sessionsCount = sessionsSnap.docs.filter(
    (d) => (d.data() as SessionDoc).localDate >= start,
  ).length;

  return JSON.stringify({
    ok: true,
    scope,
    todos: { open: openTodos, overdue },
    routines: { scheduledToday: routinesScheduled, doneToday: routinesDone },
    money: {
      income: income / 100,
      expense: expense / 100,
      net: (income - expense) / 100,
      currency: ctx.currency,
    },
    checkInsLogged: dailyCount,
    workoutsLogged: sessionsCount,
  });
}

// ---------------------------------------------------------------------------
// WRITE executors
// ---------------------------------------------------------------------------

async function addTodo(ctx: ToolContext, args: ParsedArgs): Promise<string> {
  const title = String(args.title ?? "").trim();
  if (!title) {
    return JSON.stringify({ ok: false, error: "title is required" });
  }
  const payload: Record<string, unknown> = {
    title,
    done: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (args.dueDate) payload.dueDate = String(args.dueDate);
  if (args.recurrence && args.recurrence !== "none") {
    payload.recurrence = String(args.recurrence);
  }
  const ref = await addDoc(todosPath(ctx.uid), payload as unknown as TodoDoc);
  return JSON.stringify({ ok: true, id: ref.id, title });
}

async function completeTodo(
  ctx: ToolContext,
  args: ParsedArgs,
): Promise<string> {
  const titleArg = String(args.title ?? "").trim().toLowerCase();
  if (!titleArg) {
    return JSON.stringify({ ok: false, error: "title is required" });
  }
  const snap = await getDocs(
    query(todosPath(ctx.uid), orderBy("createdAt", "desc"), fbLimit(200)),
  );
  const match = snap.docs.find(
    (d) =>
      !(d.data() as TodoDoc).done &&
      (d.data() as TodoDoc).title.toLowerCase() === titleArg,
  );
  if (!match) {
    return JSON.stringify({
      ok: false,
      error: `No open todo matches '${args.title}'.`,
    });
  }
  await updateDoc(todoPath(ctx.uid, match.id), {
    done: true,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return JSON.stringify({ ok: true, id: match.id, title: String(args.title) });
}

async function addExpense(
  ctx: ToolContext,
  args: ParsedArgs,
): Promise<string> {
  const amount = Number(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return JSON.stringify({ ok: false, error: "amount must be > 0" });
  }
  const kind = (args.kind as "expense" | "income") ?? "expense";
  const category = (args.category as string) ?? (kind === "income" ? "income" : "other");
  const date = (args.date as string) ?? today(ctx);
  const payload: Record<string, unknown> = {
    amountMinor: Math.round(amount * 100),
    currency: ctx.currency,
    kind,
    category,
    localDate: date,
    date: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const note = (args.note as string | undefined)?.trim();
  if (note) payload.note = note;
  const ref = await addDoc(
    expensesPath(ctx.uid),
    payload as unknown as ExpenseDoc,
  );
  return JSON.stringify({
    ok: true,
    id: ref.id,
    amount,
    kind,
    category,
    date,
  });
}

async function addRoutine(
  ctx: ToolContext,
  args: ParsedArgs,
): Promise<string> {
  const name = String(args.name ?? "").trim();
  const weekdays = Array.isArray(args.weekdays)
    ? args.weekdays
        .map((d) => Number(d))
        .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6)
    : [];
  if (!name || weekdays.length === 0) {
    return JSON.stringify({
      ok: false,
      error: "name and at least one weekday are required",
    });
  }
  const ref = await addDoc(routinesPath(ctx.uid), {
    name,
    weekdays: [...new Set(weekdays)].sort(),
    active: true,
    done: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as unknown as RoutineDoc);
  return JSON.stringify({ ok: true, id: ref.id, name, weekdays });
}

async function checkRoutine(
  ctx: ToolContext,
  args: ParsedArgs,
): Promise<string> {
  const nameArg = String(args.name ?? "").trim().toLowerCase();
  if (!nameArg) {
    return JSON.stringify({ ok: false, error: "name is required" });
  }
  const date = (args.date as string) ?? today(ctx);
  const snap = await getDocs(routinesPath(ctx.uid));
  const match = snap.docs.find(
    (d) => (d.data() as RoutineDoc).name.toLowerCase() === nameArg,
  );
  if (!match) {
    return JSON.stringify({
      ok: false,
      error: `No routine matches '${args.name}'.`,
    });
  }
  const data = match.data() as RoutineDoc;
  const next = { ...(data.done ?? {}) };
  next[date] = true;
  await updateDoc(routinePath(ctx.uid, match.id), {
    done: next,
    updatedAt: serverTimestamp(),
  });
  return JSON.stringify({
    ok: true,
    id: match.id,
    name: data.name,
    date,
  });
}

async function logCheckIn(
  ctx: ToolContext,
  args: ParsedArgs,
): Promise<string> {
  const date = (args.date as string) ?? today(ctx);
  const patch: Record<string, unknown> = {
    localDate: date,
    updatedAt: serverTimestamp(),
  };
  if (typeof args.bodyweight === "number") {
    patch.bodyweightKg = ctx.unitImperial
      ? Math.round(lbToKg(args.bodyweight) * 1000) / 1000
      : Math.round((args.bodyweight as number) * 1000) / 1000;
  }
  for (const k of [
    "sleepHours",
    "sleepQuality",
    "calories",
    "proteinG",
    "waterMl",
    "steps",
    "mood",
  ] as const) {
    if (typeof args[k] === "number") patch[k] = args[k];
  }
  for (const k of ["note", "struggles", "wins", "planTomorrow"] as const) {
    if (typeof args[k] === "string" && (args[k] as string).trim().length > 0) {
      patch[k] = (args[k] as string).trim();
    }
  }
  await setDoc(dailyPath(ctx.uid, date), patch as unknown as DailyDoc, {
    merge: true,
  });
  return JSON.stringify({ ok: true, date });
}

// Re-exports the executor uses elsewhere
export { deleteField, onSnapshot };
