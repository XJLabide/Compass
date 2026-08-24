"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  TrendingUp,
  Trash2,
  Wallet,
  DollarSign,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
} from "lucide-react";
import clsx from "clsx";

import { useUserData } from "@/lib/data/UserDataProvider";
import {
  budgetPath,
  budgetsPath,
  expensePath,
  expensesPath,
  profilePath,
} from "@/lib/db/paths";
import type { BudgetDoc, ExpenseDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";
import RecurringFeesSection, {
  type RecurringSummary,
} from "@/components/money/RecurringFeesSection";
import { displayCategory, listExpenseCategories } from "@/lib/money/categories";
import PortfolioTab from "@/components/money/PortfolioTab";
import BalancesTab from "@/components/money/BalancesTab";
import { formatCurrencyAmount, getCurrencySymbol } from "@/lib/money/currency";

const EMPTY_RECURRING_SUMMARY: RecurringSummary = {
  monthlyCommitted: 0,
  activeCount: 0,
  dueSoonCount: 0,
};

function formatMoney(minor: number, currency: string, hideAmounts: boolean = false): string {
  return formatCurrencyAmount(minor / 100, currency, 2, hideAmounts);
}

type BudgetRow = { id: string; data: BudgetDoc };
type ExpenseRow = { id: string; data: ExpenseDoc };
type BudgetMode = "allowance" | "monthly";

function monthStartFor(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

function monthEndFor(localDate: string): string {
  const [year, month] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDaysInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function defaultBudgetName(mode: BudgetMode, startDate: string, endDate: string): string {
  if (mode === "monthly") return `${startDate.slice(0, 7)} monthly budget`;
  return `${startDate} to ${endDate} allowance`;
}

export default function FinancePage() {
  const { uid, profile, effectiveProfile } = useUserData();
  const tz = effectiveProfile?.timezone ?? "UTC";
  const userCurrency = "PHP";
  const today = useMemo(() => computeLocalDate(new Date(), tz), [tz]);
  const currentMonthStart = useMemo(() => monthStartFor(today), [today]);
  const currentMonthEnd = useMemo(() => monthEndFor(today), [today]);

  useEffect(() => {
    if (uid && profile && profile.currency !== "PHP") {
      void setDoc(profilePath(uid), { currency: "PHP" }, { merge: true });
    }
  }, [uid, profile]);

  const [activeTab, setActiveTab] = useState<"spending" | "accounts" | "investments">("spending");
  const [hideAmounts, setHideAmounts] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("compass_finances_privacy_mode") === "true";
  });

  const toggleHideAmounts = () => {
    setHideAmounts((prev) => {
      const next = !prev;
      localStorage.setItem("compass_finances_privacy_mode", next.toString());
      return next;
    });
  };

  // Spending state
  const [budgets, setBudgets] = useState<BudgetRow[] | null>(null);
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entryNotice, setEntryNotice] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [note, setNote] = useState("");
  const [entryDate, setEntryDate] = useState(today);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deletedExpense, setDeletedExpense] = useState<ExpenseRow | null>(null);
  const [recurringSummary, setRecurringSummary] = useState<RecurringSummary>(EMPTY_RECURRING_SUMMARY);
  const [adding, setAdding] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);
  const [budgetMode, setBudgetMode] = useState<BudgetMode>("allowance");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetStartDate, setBudgetStartDate] = useState(today);
  const [budgetEndDate, setBudgetEndDate] = useState(addDays(today, 6));

  const categoryOptions = useMemo(() => listExpenseCategories(profile), [profile]);

  const activeBudget = useMemo(() => {
    if (!budgets?.length) return null;
    return budgets.find((budget) => budget.data.active) ?? null;
  }, [budgets]);

  const periodStart = activeBudget?.data.startDate ?? currentMonthStart;
  const periodEnd = activeBudget?.data.endDate ?? currentMonthEnd;
  const entryOutsidePeriod = entryDate < periodStart || entryDate > periodEnd;

  useEffect(() => {
    if (!activeBudget) {
      setBudgetStartDate((prev) => (prev === today ? prev : today));
      setBudgetEndDate((prev) => (prev === addDays(today, 6) ? prev : addDays(today, 6)));
      return;
    }

    setBudgetMode(activeBudget.data.mode);
    setBudgetAmount(String(activeBudget.data.amountMinor / 100));
    setBudgetStartDate(activeBudget.data.startDate);
    setBudgetEndDate(activeBudget.data.endDate);
  }, [activeBudget, today]);

  useEffect(() => {
    if (budgetMode !== "monthly") return;
    setBudgetStartDate(currentMonthStart);
    setBudgetEndDate(currentMonthEnd);
  }, [budgetMode, currentMonthEnd, currentMonthStart]);

  useEffect(() => {
    setBudgets(null);
    if (!uid) return;
    const q = query(budgetsPath(uid), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBudgets(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
        setPageError(null);
      },
      (err) => {
        setPageError(err.message);
        setBudgets([]);
      },
    );
    return unsub;
  }, [uid]);

  // Subscribe to expenses and income inside the active budget period.
  useEffect(() => {
    setRows(null);
    if (!uid) return;
    const q = query(
      expensesPath(uid),
      where("localDate", ">=", periodStart),
      where("localDate", "<=", periodEnd),
      orderBy("localDate", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
        setPageError(null);
      },
      (err) => {
        setPageError(err.message);
        setRows([]);
      },
    );
    return unsub;
  }, [uid, periodEnd, periodStart]);

  const { periodIncomeMinor, periodExpenseMinor } = useMemo(() => {
    if (!rows) return { periodIncomeMinor: 0, periodExpenseMinor: 0 };
    let inc = 0;
    let exp = 0;
    for (const r of rows) {
      if (r.data.kind === "income") inc += r.data.amountMinor;
      else exp += r.data.amountMinor;
    }
    return { periodIncomeMinor: inc, periodExpenseMinor: exp };
  }, [rows]);

  const spendByCategory = useMemo(() => {
    const map = new Map<string, number>();
    if (!rows) return map;
    for (const r of rows) {
      if (r.data.kind === "expense") {
        const cat = r.data.category || "other";
        map.set(cat, (map.get(cat) || 0) + r.data.amountMinor);
      }
    }
    return map;
  }, [rows]);

  const categoryBreakdown = useMemo(
    () =>
      Array.from(spendByCategory.entries())
        .map(([categoryId, spentMinor]) => ({ categoryId, spentMinor }))
        .sort((a, b) => b.spentMinor - a.spentMinor),
    [spendByCategory],
  );

  const budgetAmountMinor = activeBudget?.data.amountMinor ?? 0;
  const budgetRemainingMinor = Math.max(0, budgetAmountMinor - periodExpenseMinor);
  const budgetOverMinor = Math.max(0, periodExpenseMinor - budgetAmountMinor);
  const rawDaysLeft = diffDaysInclusive(today, periodEnd);
  const daysLeft = activeBudget ? rawDaysLeft : diffDaysInclusive(today, currentMonthEnd);
  const safePerDayMinor =
    activeBudget && rawDaysLeft > 0 ? Math.floor(budgetRemainingMinor / rawDaysLeft) : 0;
  const spentPercent =
    budgetAmountMinor > 0 ? Math.min(100, Math.round((periodExpenseMinor / budgetAmountMinor) * 100)) : 0;

  const handleSaveBudget = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!uid) return;

      const parsed = parseFloat(budgetAmount);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setBudgetError("Please enter a valid budget amount.");
        return;
      }
      if (budgetEndDate < budgetStartDate) {
        setBudgetError("Budget end date must be after the start date.");
        return;
      }

      setSavingBudget(true);
      setBudgetError(null);

      try {
        const amountMinor = Math.round(parsed * 100);
        const name = defaultBudgetName(budgetMode, budgetStartDate, budgetEndDate);
        const now = serverTimestamp() as any;

        if (budgets?.length) {
          await Promise.all(
            budgets
              .filter((budget) => budget.id !== activeBudget?.id && budget.data.active)
              .map((budget) =>
                setDoc(
                  budgetPath(uid, budget.id),
                  { active: false, updatedAt: now } as Partial<BudgetDoc>,
                  { merge: true },
                ),
              ),
          );
        }

        const payload = {
          name,
          mode: budgetMode,
          amountMinor,
          currency: userCurrency,
          startDate: budgetStartDate,
          endDate: budgetEndDate,
          active: true,
          updatedAt: now,
          ...(activeBudget ? {} : { createdAt: now }),
        };

        if (activeBudget) {
          await setDoc(budgetPath(uid, activeBudget.id), payload as BudgetDoc, { merge: true });
        } else {
          await addDoc(budgetsPath(uid), payload as BudgetDoc);
        }

        setBudgetFormOpen(false);
      } catch (err) {
        setBudgetError(err instanceof Error ? err.message : "Failed to save budget.");
      } finally {
        setSavingBudget(false);
      }
    },
    [
      activeBudget,
      budgetAmount,
      budgetEndDate,
      budgetMode,
      budgets,
      budgetStartDate,
      uid,
      userCurrency,
    ],
  );

  const handleAddExpense = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!uid) return;

      const num = parseFloat(amount);
      if (!Number.isFinite(num) || num <= 0) {
        setEntryError("Please enter a valid positive amount.");
        return;
      }
      const amountMinor = Math.round(num * 100);

      setAdding(true);
      setEntryError(null);
      setEntryNotice(null);

      try {
        const trimmedNote = note.trim();
        const localDate = entryDate || today;
        const payload = {
          amountMinor,
          currency: userCurrency,
          kind,
          category: category.trim() || "other",
          localDate,
          date: serverTimestamp() as any,
          ...(trimmedNote ? { note: trimmedNote } : {}),
          updatedAt: serverTimestamp() as any,
        };

        if (editingExpenseId) {
          await setDoc(expensePath(uid, editingExpenseId), payload as Partial<ExpenseDoc>, {
            merge: true,
          });
        } else {
          await addDoc(expensesPath(uid), {
            ...payload,
            createdAt: serverTimestamp() as any,
          } as ExpenseDoc);
        }

        setAmount("");
        setNote("");
        setEditingExpenseId(null);
        setDeletedExpense(null);
        setEntryNotice(
          localDate < periodStart || localDate > periodEnd
            ? `Saved for ${localDate}. It is outside the current budget period, so it will not appear in this list.`
            : editingExpenseId
              ? "Entry updated."
              : "Entry saved.",
        );
      } catch (err) {
        setEntryError(err instanceof Error ? err.message : "Failed to save entry.");
      } finally {
        setAdding(false);
      }
    },
    [
      uid,
      amount,
      userCurrency,
      kind,
      category,
      entryDate,
      today,
      note,
      editingExpenseId,
      periodEnd,
      periodStart,
    ],
  );

  const handleEditExpense = useCallback((row: ExpenseRow) => {
    setEditingExpenseId(row.id);
    setAmount(String(row.data.amountMinor / 100));
    setKind(row.data.kind);
    setCategory(row.data.category || "other");
    setEntryDate(row.data.localDate || today);
    setNote(row.data.note ?? "");
    setEntryError(null);
    setEntryNotice(null);
  }, [today]);

  const handleCancelEdit = useCallback(() => {
    setEditingExpenseId(null);
    setAmount("");
    setNote("");
    setEntryDate(today);
    setEntryError(null);
  }, [today]);

  const handleDeleteExpense = useCallback(
    async (row: ExpenseRow) => {
      if (!uid) return;
      try {
        setEntryError(null);
        setEntryNotice(null);
        setDeletedExpense(row);
        await deleteDoc(expensePath(uid, row.id));
        setEntryNotice("Entry deleted.");
      } catch (err) {
        setEntryError(err instanceof Error ? err.message : "Failed to delete entry.");
      }
    },
    [uid],
  );

  const handleUndoDelete = useCallback(async () => {
    if (!uid || !deletedExpense) return;
    try {
      await setDoc(expensePath(uid, deletedExpense.id), deletedExpense.data);
      setDeletedExpense(null);
      setEntryNotice("Entry restored.");
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : "Failed to restore entry.");
    }
  }, [deletedExpense, uid]);

  if (!uid) return null;

  return (
    <section className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-100">Finances</h1>
            <button
              onClick={toggleHideAmounts}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-neutral-800/80 px-2.5 py-1 text-xs font-medium text-muted transition hover:border-neutral-600 hover:text-neutral-100"
              title={hideAmounts ? "Show Amounts" : "Hide Amounts (Privacy Mode)"}
            >
              {hideAmounts ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-[11px] text-amber-400 font-semibold">Hidden</span>
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 text-muted" />
                  <span className="text-[11px]">Hide</span>
                </>
              )}
            </button>
          </div>
          <span className="rounded-full bg-accent/10 border border-accent/30 px-2.5 py-0.5 text-[11px] sm:text-xs font-semibold text-accent">
            Budget Tracking
          </span>
        </div>
        <p className="text-xs text-muted">
          Allowance budgeting, daily spending, liquid balances, and investments.
        </p>
      </div>

      {/* Spending Overview */}
      <div className="rounded-xl border border-border bg-neutral-900/40 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <CalendarDays className="h-4 w-4 text-accent" />
              <span>
                {activeBudget
                  ? `${activeBudget.data.mode === "monthly" ? "Monthly" : "Allowance"} budget`
                  : "No active budget"}
              </span>
              <span>{periodStart} to {periodEnd}</span>
            </div>
            <div>
              <p className="text-xs text-muted">Left to spend</p>
              <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-neutral-100 sm:text-4xl">
                {activeBudget
                  ? formatMoney(budgetRemainingMinor, userCurrency, hideAmounts)
                  : formatMoney(0, userCurrency, hideAmounts)}
              </h2>
              {activeBudget && budgetOverMinor > 0 ? (
                <p className="mt-1 text-xs font-semibold text-rose-400">
                  Over budget by {formatMoney(budgetOverMinor, userCurrency, hideAmounts)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  {activeBudget
                    ? `${formatMoney(safePerDayMinor, userCurrency, hideAmounts)} safe per day`
                    : "Set a monthly budget or an allowance cycle to start tracking."}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-neutral-950/30 p-3">
              <p className="text-xs text-muted">Spent</p>
              <p className="mt-1 text-base font-bold text-rose-300">
                {formatMoney(periodExpenseMinor, userCurrency, hideAmounts)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-neutral-950/30 p-3">
              <p className="text-xs text-muted">Budget</p>
              <p className="mt-1 text-base font-bold text-neutral-100">
                {formatMoney(budgetAmountMinor, userCurrency, hideAmounts)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-neutral-950/30 p-3">
              <p className="text-xs text-muted">Days left</p>
              <p className="mt-1 text-base font-bold text-neutral-100">
                {activeBudget ? Math.max(0, daysLeft) : 0}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-neutral-950/30 p-3">
              <p className="text-xs text-muted">Fixed/mo</p>
              <p className="mt-1 text-base font-bold text-neutral-100">
                {formatMoney(recurringSummary.monthlyCommitted, userCurrency, hideAmounts)}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded bg-neutral-800">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${spentPercent}%` }} />
        </div>
      </div>

      {/* Finance Tabs */}
      <div className="flex border-b border-border/60 overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActiveTab("spending")}
          className={clsx(
            "flex items-center gap-1.5 border-b-2 px-3 sm:px-4 py-2.5 text-xs font-semibold transition shrink-0",
            activeTab === "spending"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-neutral-200",
          )}
        >
          <DollarSign className="h-4 w-4" />
          Spending
        </button>
        <button
          onClick={() => setActiveTab("accounts")}
          className={clsx(
            "flex items-center gap-1.5 border-b-2 px-3 sm:px-4 py-2.5 text-xs font-semibold transition shrink-0",
            activeTab === "accounts"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-neutral-200",
          )}
        >
          <Wallet className="h-4 w-4" />
          Accounts
        </button>
        <button
          onClick={() => setActiveTab("investments")}
          className={clsx(
            "flex items-center gap-1.5 border-b-2 px-3 sm:px-4 py-2.5 text-xs font-semibold transition shrink-0",
            activeTab === "investments"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-neutral-200",
          )}
        >
          <TrendingUp className="h-4 w-4" />
          Investments
        </button>
      </div>

      {pageError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {pageError}
        </div>
      ) : null}

      {/* Active Tab Views */}
      {activeTab === "accounts" && (
        <BalancesTab uid={uid} userCurrency={userCurrency} hideAmounts={hideAmounts} />
      )}

      {activeTab === "investments" && (
        <PortfolioTab uid={uid} userCurrency={userCurrency} hideAmounts={hideAmounts} />
      )}

      {activeTab === "spending" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-neutral-900/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">Active Budget</h3>
                <p className="mt-1 text-xs text-muted">
                  {activeBudget
                    ? `${activeBudget.data.name} tracks spending from ${activeBudget.data.startDate} to ${activeBudget.data.endDate}.`
                    : "Choose allowance-cycle for a specific allowance, or monthly for a calendar budget."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBudgetFormOpen((prev) => !prev)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-100 transition hover:border-neutral-600"
              >
                <Pencil className="h-4 w-4" />
                {activeBudget ? "Edit Budget" : "Set Budget"}
              </button>
            </div>

            {budgetError ? (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {budgetError}
              </div>
            ) : null}

            {(budgetFormOpen || !activeBudget) && (
              <form onSubmit={handleSaveBudget} className="mt-4 grid grid-cols-1 gap-3 border-t border-border/60 pt-4 sm:grid-cols-5">
                <div>
                  <label htmlFor="budget-mode" className="text-xs text-muted">Mode</label>
                  <select
                    id="budget-mode"
                    value={budgetMode}
                    onChange={(e) => setBudgetMode(e.target.value as BudgetMode)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="allowance">Allowance cycle</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="budget-amount" className="text-xs text-muted">Budget ({getCurrencySymbol(userCurrency)})</label>
                  <input
                    id="budget-amount"
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="0.00"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                <div>
                  <label htmlFor="budget-start" className="text-xs text-muted">Start</label>
                  <input
                    id="budget-start"
                    type="date"
                    value={budgetStartDate}
                    disabled={budgetMode === "monthly"}
                    onChange={(e) => setBudgetStartDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                <div>
                  <label htmlFor="budget-end" className="text-xs text-muted">End</label>
                  <input
                    id="budget-end"
                    type="date"
                    value={budgetEndDate}
                    disabled={budgetMode === "monthly"}
                    onChange={(e) => setBudgetEndDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={savingBudget}
                    className="w-full rounded-lg bg-accent py-2 text-xs font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingBudget ? "Saving..." : "Save Budget"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Period Cash Flow Summaries */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-neutral-900/40 p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <ArrowDownRight className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs text-muted">Income (This Period)</span>
                <p className="text-xl font-bold text-emerald-400">
                  {formatMoney(periodIncomeMinor, userCurrency, hideAmounts)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-neutral-900/40 p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400">
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs text-muted">Expenses (This Period)</span>
                <p className="text-xl font-bold text-rose-400">
                  {formatMoney(periodExpenseMinor, userCurrency, hideAmounts)}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Expense/Income Entry Form */}
          <div className="rounded-xl border border-border bg-neutral-900/40 p-4 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-neutral-100">
                {editingExpenseId ? "Edit Cash Flow Entry" : "Log Cash Flow Entry"}
              </h3>
              {editingExpenseId ? (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-left text-xs font-semibold text-muted transition hover:text-neutral-100 sm:text-right"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>

            {entryError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {entryError}
              </div>
            ) : null}

            {entryNotice ? (
              <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 sm:flex-row sm:items-center sm:justify-between">
                <span>{entryNotice}</span>
                {deletedExpense ? (
                  <button
                    type="button"
                    onClick={handleUndoDelete}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-200 transition hover:text-emerald-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Undo
                  </button>
                ) : null}
              </div>
            ) : null}

            {entryOutsidePeriod ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                This date is outside the active budget period. It will save, but it will not appear in this period list.
              </div>
            ) : null}

            <form onSubmit={handleAddExpense} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <div>
                <label htmlFor="cashflow-kind" className="text-xs text-muted">Type</label>
                <select
                  id="cashflow-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "expense" | "income")}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>

              <div>
                <label htmlFor="cashflow-amount" className="text-xs text-muted">Amount ({getCurrencySymbol(userCurrency)})</label>
                <input
                  id="cashflow-amount"
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label htmlFor="cashflow-date" className="text-xs text-muted">Date</label>
                <input
                  id="cashflow-date"
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label htmlFor="cashflow-category" className="text-xs text-muted">Category</label>
                <select
                  id="cashflow-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cashflow-note" className="text-xs text-muted">Note</label>
                <input
                  id="cashflow-note"
                  type="text"
                  placeholder="Optional note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={adding}
                  className="w-full rounded-lg bg-accent py-2 text-xs font-semibold text-accent-foreground transition hover:opacity-90"
                >
                  {adding ? "Saving..." : editingExpenseId ? "Update" : "Log Entry"}
                </button>
              </div>
            </form>
          </div>

          {/* Transactions History */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-200">Recent Transactions</h3>

            {!rows ? (
              <Skeleton className="h-24 w-full" />
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-border/50 p-6 text-center text-xs text-muted">
                No entries logged in this period yet.
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const isInc = r.data.kind === "income";
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-neutral-900/30 p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            isInc
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
                          }`}
                        >
                          {isInc ? (
                            <ArrowDownRight className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-sm text-neutral-100">
                            {displayCategory(r.data.category)}
                          </span>
                          <p className="text-xs text-muted">{r.data.localDate}</p>
                          {r.data.note ? (
                            <p className="text-xs text-neutral-300">{r.data.note}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span
                          className={`font-semibold text-sm ${
                            isInc ? "text-emerald-400" : "text-neutral-100"
                          }`}
                        >
                          {isInc ? "+" : "-"}
                          {formatMoney(r.data.amountMinor, userCurrency, hideAmounts)}
                        </span>
                        <button
                          onClick={() => handleEditExpense(r)}
                          className="text-muted hover:text-accent transition"
                          title="Edit entry"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(r)}
                          className="text-muted hover:text-rose-400 transition"
                          title="Delete entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-neutral-900/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-100">Spending by Category</h3>
              <span className="text-xs text-muted">
                {categoryBreakdown.length} {categoryBreakdown.length === 1 ? "category" : "categories"}
              </span>
            </div>

            {categoryBreakdown.length === 0 ? (
              <div className="mt-4 rounded-lg border border-border/50 p-4 text-xs text-muted">
                No expense categories yet for this budget period.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {categoryBreakdown.map(({ categoryId, spentMinor }) => {
                  const share =
                    periodExpenseMinor > 0 ? Math.round((spentMinor / periodExpenseMinor) * 100) : 0;
                  return (
                    <div key={categoryId} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-neutral-200">
                          {displayCategory(categoryId)}
                        </span>
                        <span className="text-muted">
                          {formatMoney(spentMinor, userCurrency, hideAmounts)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded bg-neutral-800">
                        <div className="h-full bg-neutral-500" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <RecurringFeesSection
            uid={uid}
            profile={profile}
            currency={userCurrency}
            today={today}
            onSummaryChange={setRecurringSummary}
          />
        </div>
      )}
    </section>
  );
}
