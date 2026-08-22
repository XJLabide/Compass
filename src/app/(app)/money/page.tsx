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
  TrendingUp,
  Trash2,
  Wallet,
  PieChart,
  DollarSign,
  Eye,
  EyeOff,
} from "lucide-react";
import clsx from "clsx";

import { useUserData } from "@/lib/data/UserDataProvider";
import { accountsPath, expensePath, expensesPath, portfolioPath, profilePath } from "@/lib/db/paths";
import type { AccountBalanceDoc, ExpenseDoc, PortfolioHoldingDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";
import BudgetSection from "@/components/money/BudgetSection";
import RecurringFeesSection, {
  type RecurringSummary,
} from "@/components/money/RecurringFeesSection";
import { displayCategory, listExpenseCategories } from "@/lib/money/categories";
import PortfolioTab from "@/components/money/PortfolioTab";
import BalancesTab from "@/components/money/BalancesTab";
import { formatCurrencyAmount, getCurrencySymbol } from "@/lib/money/currency";
import {
  isLegacySeededAccount,
  isLegacySeededPortfolioHolding,
} from "@/lib/money/legacyFinanceSeeds";

const DEFAULT_CURRENCY = "PHP";
const EMPTY_RECURRING_SUMMARY: RecurringSummary = {
  monthlyCommitted: 0,
  activeCount: 0,
  dueSoonCount: 0,
};

function formatMoney(minor: number, currency: string, hideAmounts: boolean = false): string {
  return formatCurrencyAmount(minor / 100, currency, 2, hideAmounts);
}

type ExpenseRow = { id: string; data: ExpenseDoc };

export default function FinancePage() {
  const { uid, profile, effectiveProfile } = useUserData();
  const tz = effectiveProfile?.timezone ?? "UTC";
  const userCurrency = "PHP";
  const today = useMemo(() => computeLocalDate(new Date(), tz), [tz]);
  const monthStart = useMemo(() => `${today.slice(0, 7)}-01`, [today]);

  useEffect(() => {
    if (uid && profile && profile.currency !== "PHP") {
      void setDoc(profilePath(uid), { currency: "PHP" }, { merge: true });
    }
  }, [uid, profile]);

  const [activeTab, setActiveTab] = useState<"portfolio" | "balances" | "cashflow">("portfolio");
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

  // State for net worth aggregation
  const [liquidTotal, setLiquidTotal] = useState(0);
  const [portfolioTotal, setPortfolioTotal] = useState(0);

  // Cash flow state
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [note, setNote] = useState("");
  const [recurringSummary, setRecurringSummary] = useState<RecurringSummary>(EMPTY_RECURRING_SUMMARY);
  const [adding, setAdding] = useState(false);

  const categoryOptions = useMemo(() => listExpenseCategories(profile), [profile]);

  // Subscribe to liquid accounts total for Net Worth hero
  useEffect(() => {
    setLiquidTotal(0);
    if (!uid) return;
    const unsub = onSnapshot(accountsPath(uid), (snap) => {
      const total = snap.docs.reduce((acc, doc) => {
        const data = doc.data();
        if (isLegacySeededAccount(data)) {
          void deleteDoc(doc.ref);
          return acc;
        }
        return acc + (data.balanceMinor || 0) / 100;
      }, 0);
      setLiquidTotal(total);
    });
    return unsub;
  }, [uid]);

  // Subscribe to portfolio holdings total for Net Worth hero
  useEffect(() => {
    setPortfolioTotal(0);
    if (!uid) return;
    let cancelled = false;
    const unsub = onSnapshot(portfolioPath(uid), (snap) => {
      const docs = snap.docs.filter((d) => {
        const data = d.data() as PortfolioHoldingDoc & { usdAmount?: number };
        if (isLegacySeededPortfolioHolding(data)) {
          void deleteDoc(d.ref);
          return false;
        }
        return true;
      });
      const tickers = Array.from(new Set(docs.map((d) => d.data().ticker)));
      if (tickers.length === 0) {
        setPortfolioTotal(0);
        return;
      }

      // Fetch live stock quotes
      fetch(`/api/finance/quote?symbols=${encodeURIComponent(tickers.join(","))}`)
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return;
          const quotes = json?.quotes || {};
          const usdToPhpRate = json?.usdToPhpRate || 58.5;
          let sumUsd = 0;
          docs.forEach((d) => {
            const h = d.data() as PortfolioHoldingDoc & { usdAmount?: number };
            const usdPrice = quotes[h.ticker]?.price ?? h.costBasisPerShare ?? 100;

            let posUsd = 0;
            if (h.usdAmount !== undefined && h.usdAmount !== null && h.usdAmount > 0) {
              posUsd = h.usdAmount;
            } else if (h.shares !== undefined && h.shares !== null && h.shares > 0) {
              posUsd = h.shares * usdPrice;
            }
            sumUsd += posUsd;
          });
          setPortfolioTotal(sumUsd * usdToPhpRate);
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  // Subscribe to cash flow expenses
  useEffect(() => {
    setRows(null);
    if (!uid) return;
    const q = query(
      expensesPath(uid),
      where("localDate", ">=", monthStart),
      orderBy("localDate", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
        setError(null);
      },
      (err) => {
        setError(err.message);
        setRows([]);
      },
    );
    return unsub;
  }, [uid, monthStart]);

  const { monthIncomeMinor, monthExpenseMinor } = useMemo(() => {
    if (!rows) return { monthIncomeMinor: 0, monthExpenseMinor: 0 };
    let inc = 0;
    let exp = 0;
    for (const r of rows) {
      if (r.data.kind === "income") inc += r.data.amountMinor;
      else exp += r.data.amountMinor;
    }
    return { monthIncomeMinor: inc, monthExpenseMinor: exp };
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

  const handleAddExpense = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!uid) return;

      const num = parseFloat(amount);
      if (!Number.isFinite(num) || num <= 0) {
        setError("Please enter a valid positive amount.");
        return;
      }
      const amountMinor = Math.round(num * 100);

      setAdding(true);
      setError(null);

      try {
        const trimmedNote = note.trim();
        await addDoc(expensesPath(uid), {
          amountMinor,
          currency: userCurrency,
          kind,
          category: category.trim() || "other",
          localDate: today,
          date: serverTimestamp() as any,
          ...(trimmedNote ? { note: trimmedNote } : {}),
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
        });

        setAmount("");
        setNote("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add entry.");
      } finally {
        setAdding(false);
      }
    },
    [uid, amount, userCurrency, kind, category, today, note],
  );

  const handleDeleteExpense = useCallback(
    async (id: string) => {
      if (!uid) return;
      try {
        await deleteDoc(expensePath(uid, id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete entry.");
      }
    },
    [uid],
  );

  if (!uid) return null;

  const totalNetWorth = liquidTotal + portfolioTotal;

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
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] sm:text-xs font-semibold text-emerald-400">
            Live Market Data
          </span>
        </div>
        <p className="text-xs text-muted">
          Net worth, stock & ETF portfolio tracking, liquid balances, and cash flow.
        </p>
      </div>

      {/* Net Worth Hero Overview Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-neutral-900 via-neutral-900/90 to-neutral-950 p-4 sm:p-6 shadow-xl">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Total Net Worth
            </span>
            <h2 className="mt-1 text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-100">
              {formatCurrencyAmount(totalNetWorth, userCurrency, 2, hideAmounts)}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3 sm:flex sm:gap-4 sm:border-t-0 sm:pt-0">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 sm:px-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                Liquid Cash
              </span>
              <p className="text-sm sm:text-base font-bold text-neutral-100">
                {formatCurrencyAmount(liquidTotal, userCurrency, 2, hideAmounts)}
              </p>
            </div>
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-2 sm:px-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
                Invested Assets
              </span>
              <p className="text-sm sm:text-base font-bold text-neutral-100">
                {formatCurrencyAmount(portfolioTotal, userCurrency, 2, hideAmounts)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Smart Sub-Tabs */}
      <div className="flex border-b border-border/60 overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActiveTab("portfolio")}
          className={clsx(
            "flex items-center gap-1.5 border-b-2 px-3 sm:px-4 py-2.5 text-xs font-semibold transition shrink-0",
            activeTab === "portfolio"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-neutral-200",
          )}
        >
          <TrendingUp className="h-4 w-4" />
          Portfolio & Stocks
        </button>
        <button
          onClick={() => setActiveTab("balances")}
          className={clsx(
            "flex items-center gap-1.5 border-b-2 px-3 sm:px-4 py-2.5 text-xs font-semibold transition shrink-0",
            activeTab === "balances"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-neutral-200",
          )}
        >
          <Wallet className="h-4 w-4" />
          Balances & Accounts
        </button>
        <button
          onClick={() => setActiveTab("cashflow")}
          className={clsx(
            "flex items-center gap-1.5 border-b-2 px-3 sm:px-4 py-2.5 text-xs font-semibold transition shrink-0",
            activeTab === "cashflow"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-neutral-200",
          )}
        >
          <DollarSign className="h-4 w-4" />
          Cash Flow
        </button>
      </div>

      {/* Active Tab Views */}
      {activeTab === "portfolio" && (
        <PortfolioTab uid={uid} userCurrency={userCurrency} hideAmounts={hideAmounts} />
      )}

      {activeTab === "balances" && (
        <BalancesTab uid={uid} userCurrency={userCurrency} hideAmounts={hideAmounts} />
      )}

      {activeTab === "cashflow" && (
        <div className="space-y-6">
          {/* Monthly Cash Flow Summaries */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-neutral-900/40 p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <ArrowDownRight className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs text-muted">Income (This Month)</span>
                <p className="text-xl font-bold text-emerald-400">
                  {formatMoney(monthIncomeMinor, userCurrency, hideAmounts)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-neutral-900/40 p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400">
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs text-muted">Expenses (This Month)</span>
                <p className="text-xl font-bold text-rose-400">
                  {formatMoney(monthExpenseMinor, userCurrency, hideAmounts)}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Expense/Income Entry Form */}
          <div className="rounded-xl border border-border bg-neutral-900/40 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-100">Log Cash Flow Entry</h3>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleAddExpense} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
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
                  {adding ? "Saving..." : "Log Entry"}
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
                No entries logged this month yet.
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
                          {formatMoney(r.data.amountMinor, userCurrency)}
                        </span>
                        <button
                          onClick={() => handleDeleteExpense(r.id)}
                          className="text-muted hover:text-rose-400 transition"
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

          <BudgetSection
            uid={uid}
            profile={profile}
            spendByCategory={spendByCategory}
            currency={userCurrency}
            recurringCommitted={recurringSummary.monthlyCommitted}
            totalSpent={monthExpenseMinor}
          />
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
