"use client";

import {
  addDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { CalendarClock, Power, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  recurringFeePath,
  recurringFeesPath,
} from "@/lib/db/paths";
import type {
  Profile,
  RecurringFeeCadence,
  RecurringFeeDoc,
} from "@/lib/db/types";
import {
  displayCategory,
  listExpenseCategories,
} from "@/lib/money/categories";

type RecurringRow = { id: string; data: RecurringFeeDoc };

export interface RecurringSummary {
  monthlyCommitted: number;
  activeCount: number;
  dueSoonCount: number;
}

interface Props {
  uid: string;
  profile: Profile | null;
  currency: string;
  today: string;
  variant?: "manage" | "overview";
  framed?: boolean;
  onSummaryChange?: (summary: RecurringSummary) => void;
}

function formatMoney(minor: number, currency: string): string {
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
}

function daysUntil(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / 86_400_000);
}

function clampBillingDay(value: number): number {
  return Math.min(31, Math.max(1, Math.round(value)));
}

function nextMonthlyDue(today: string, billingDay: number): string {
  const day = clampBillingDay(billingDay);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const current = new Date(Date.UTC(year, month - 1, day));
  if (current.toISOString().slice(0, 10) >= today) {
    return current.toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function getNextDue(fee: RecurringFeeDoc, today: string): string | null {
  if (fee.nextDueDate) return fee.nextDueDate;
  if (fee.cadence === "monthly") {
    return nextMonthlyDue(today, fee.billingDay ?? 1);
  }
  if (fee.cadence === "yearly" && fee.billingMonthDay) {
    const year = Number(today.slice(0, 4));
    const candidate = `${year}-${fee.billingMonthDay}`;
    return candidate >= today ? candidate : `${year + 1}-${fee.billingMonthDay}`;
  }
  return null;
}

function monthlyEquivalent(fee: RecurringFeeDoc): number {
  if (!fee.active) return 0;
  if (fee.cadence === "weekly") return Math.round((fee.amountMinor * 52) / 12);
  if (fee.cadence === "yearly") return Math.round(fee.amountMinor / 12);
  return fee.amountMinor;
}

export default function RecurringFeesSection({
  uid,
  profile,
  currency,
  today,
  variant = "manage",
  framed = true,
  onSummaryChange,
}: Props) {
  const [rows, setRows] = useState<RecurringRow[] | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("subscriptions");
  const [cadence, setCadence] = useState<RecurringFeeCadence>("monthly");
  const [billingDay, setBillingDay] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = variant === "manage";

  const categoryOptions = useMemo(
    () => listExpenseCategories(profile),
    [profile],
  );

  useEffect(() => {
    const q = query(recurringFeesPath(uid), orderBy("createdAt", "desc"));
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

  const summary = useMemo<RecurringSummary>(() => {
    let monthlyCommitted = 0;
    let activeCount = 0;
    let dueSoonCount = 0;
    for (const row of rows ?? []) {
      if (!row.data.active) continue;
      activeCount += 1;
      monthlyCommitted += monthlyEquivalent(row.data);
      const due = getNextDue(row.data, today);
      if (due) {
        const days = daysUntil(today, due);
        if (days >= 0 && days <= 10) dueSoonCount += 1;
      }
    }
    return { monthlyCommitted, activeCount, dueSoonCount };
  }, [rows, today]);

  useEffect(() => {
    onSummaryChange?.(summary);
  }, [onSummaryChange, summary]);

  const activeRows = useMemo(
    () =>
      [...(rows ?? [])].sort((a, b) => {
        if (a.data.active !== b.data.active) return a.data.active ? -1 : 1;
        const aDue = getNextDue(a.data, today) ?? "9999-99-99";
        const bDue = getNextDue(b.data, today) ?? "9999-99-99";
        return aDue.localeCompare(bDue);
      }),
    [rows, today],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (saving) return;
      const value = parseFloat(amount);
      const title = name.trim();
      if (!title || !Number.isFinite(value) || value <= 0) return;
      setSaving(true);
      setError(null);
      try {
        await addDoc(recurringFeesPath(uid), {
          name: title,
          amountMinor: Math.round(value * 100),
          currency,
          category,
          cadence,
          billingDay: clampBillingDay(Number(billingDay) || 1),
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as unknown as RecurringFeeDoc);
        setName("");
        setAmount("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save fee");
      } finally {
        setSaving(false);
      }
    },
    [amount, billingDay, cadence, category, currency, name, saving, uid],
  );

  const toggleActive = useCallback(
    async (row: RecurringRow) => {
      try {
        await updateDoc(recurringFeePath(uid, row.id), {
          active: !row.data.active,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update fee");
      }
    },
    [uid],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteDoc(recurringFeePath(uid, id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete fee");
      }
    },
    [uid],
  );

  const shellClass = framed
    ? "rounded-xl border border-border bg-neutral-900/40 p-4"
    : "space-y-0";

  return (
    <section className={shellClass}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">
            Recurring fees
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {canManage
              ? `${formatMoney(summary.monthlyCommitted, currency)} committed monthly`
              : `${summary.activeCount} active · ${formatMoney(summary.monthlyCommitted, currency)} monthly`}
          </p>
        </div>
        {summary.dueSoonCount > 0 ? (
          <span className="shrink-0 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[11px] font-medium text-amber-300">
            {summary.dueSoonCount} due soon
          </span>
        ) : null}
      </div>

      {canManage ? (
        <form onSubmit={handleSubmit} className="mt-4 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1.4fr_0.8fr]">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name, e.g. Spotify"
              maxLength={200}
              className="h-10 rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              aria-label="Recurring fee amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-10 rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
            >
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={cadence}
              onChange={(e) =>
                setCadence(e.target.value as RecurringFeeCadence)
              }
              className="h-10 rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
            </select>
            <input
              type="number"
              min="1"
              max="31"
              value={billingDay}
              onChange={(e) => setBillingDay(e.target.value)}
              aria-label="Billing day"
              className="h-10 rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !name.trim() || !amount}
            className="h-10 w-full rounded-md bg-neutral-100 text-sm font-semibold text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add recurring fee"}
          </button>
        </form>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
        {rows === null ? (
          <li className="px-3 py-3 text-sm text-muted">Loading fees…</li>
        ) : activeRows.length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted">
            {canManage
              ? "Add rent, subscriptions, insurance, or other predictable charges."
              : "No recurring fees configured. Set them up in Settings."}
          </li>
        ) : (
          activeRows.map((row) => {
            const due = getNextDue(row.data, today);
            const dueIn = due ? daysUntil(today, due) : null;
            return (
              <li
                key={row.id}
                className="flex items-center gap-3 px-3 py-3"
              >
                <CalendarClock
                  aria-hidden
                  className={
                    row.data.active
                      ? "h-4 w-4 shrink-0 text-accent"
                      : "h-4 w-4 shrink-0 text-muted"
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-neutral-100">
                      {row.data.name}
                    </span>
                    {!row.data.active ? (
                      <span className="text-[11px] text-muted">paused</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {displayCategory(row.data.category)} · {row.data.cadence}
                    {due && row.data.active
                      ? ` · due ${dueIn === 0 ? "today" : `in ${dueIn}d`}`
                      : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums text-neutral-100">
                    {formatMoney(row.data.amountMinor, row.data.currency)}
                  </div>
                  {row.data.cadence !== "monthly" ? (
                    <div className="text-[11px] text-muted">
                      {formatMoney(monthlyEquivalent(row.data), currency)}/mo
                    </div>
                  ) : null}
                </div>
                {canManage ? (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleActive(row)}
                      aria-label={row.data.active ? "Pause fee" : "Resume fee"}
                      className="rounded-md p-1.5 text-muted hover:bg-neutral-800 hover:text-neutral-100"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      aria-label="Delete recurring fee"
                      className="rounded-md p-1.5 text-muted hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
