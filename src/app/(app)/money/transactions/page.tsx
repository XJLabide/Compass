"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

import Skeleton from "@/components/ui/Skeleton";
import TransactionRow, {
  type TransactionRowData,
} from "@/components/money/TransactionRow";
import { useUserData } from "@/lib/data/UserDataProvider";
import { expensesPath } from "@/lib/db/paths";
import { displayCategory } from "@/lib/money/categories";
import { formatCurrencyAmount } from "@/lib/money/currency";

type TransactionKindFilter = "all" | "expense" | "income";

const LOAD_TIMEOUT_MS = 10_000;

function transactionTimestamp(row: TransactionRowData): number {
  const date = row.data.date as { toMillis?: () => number } | undefined;
  return typeof date?.toMillis === "function" ? date.toMillis() : 0;
}

export default function TransactionsPage() {
  const { uid, profile } = useUserData();
  const currency = profile?.currency ?? "PHP";
  const [rows, setRows] = useState<TransactionRowData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<TransactionKindFilter>("all");
  const [hideAmounts, setHideAmounts] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("compass_finances_privacy_mode") === "true";
  });

  useEffect(() => {
    if (!uid) return;

    let receivedSnapshot = false;
    setRows(null);
    setError(null);

    const transactionsQuery = query(
      expensesPath(uid),
      orderBy("localDate", "desc"),
    );
    const timeoutId = window.setTimeout(() => {
      if (receivedSnapshot) return;
      setRows([]);
      setError(
        "Transaction history has not responded. Check your Firestore connection and try again.",
      );
    }, LOAD_TIMEOUT_MS);

    const unsubscribe = onSnapshot(
      transactionsQuery,
      (snapshot) => {
        receivedSnapshot = true;
        window.clearTimeout(timeoutId);
        setRows(
          snapshot.docs.map((document) => ({
            id: document.id,
            data: document.data(),
          })),
        );
        setError(null);
      },
      (snapshotError) => {
        receivedSnapshot = true;
        window.clearTimeout(timeoutId);
        setRows([]);
        setError(snapshotError.message);
      },
    );

    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [uid, reloadKey]);

  const orderedRows = useMemo(
    () =>
      [...(rows ?? [])].sort((left, right) => {
        const dateDifference = right.data.localDate.localeCompare(left.data.localDate);
        return dateDifference || transactionTimestamp(right) - transactionTimestamp(left);
      }),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return orderedRows.filter(({ data }) => {
      if (kindFilter !== "all" && data.kind !== kindFilter) return false;
      if (!term) return true;
      return [displayCategory(data.category), data.note ?? "", data.localDate]
        .join(" ")
        .toLocaleLowerCase()
        .includes(term);
    });
  }, [kindFilter, orderedRows, search]);

  const toggleHideAmounts = () => {
    setHideAmounts((previous) => {
      const next = !previous;
      localStorage.setItem("compass_finances_privacy_mode", String(next));
      return next;
    });
  };

  if (!uid) return null;

  return (
    <section className="space-y-6 pb-12">
      <header className="space-y-4 border-b border-border pb-4">
        <Link
          href="/money"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-neutral-100"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Finances
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-100 sm:text-2xl">
              All transactions
            </h1>
            <p className="mt-1 text-sm text-muted">
              Income and expenses across all dates.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleHideAmounts}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-800/80 px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-neutral-600 hover:text-neutral-100"
            aria-label={hideAmounts ? "Show transaction amounts" : "Hide transaction amounts"}
          >
            {hideAmounts ? (
              <>
                <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
                Show amounts
              </>
            ) : (
              <>
                <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                Hide amounts
              </>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search category, note, or date"
          aria-label="Search transactions"
          className="min-w-0 flex-1 rounded-lg border border-border bg-neutral-800 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <select
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as TransactionKindFilter)}
          aria-label="Filter by transaction type"
          className="rounded-lg border border-border bg-neutral-800 px-3 py-2.5 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent sm:w-44"
        >
          <option value="all">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
        </select>
      </div>

      {error ? (
        <div className="flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm text-red-300">
            Could not load transactions: {error}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="shrink-0 self-start text-sm font-semibold text-red-200 underline underline-offset-4 hover:text-white sm:self-auto"
          >
            Retry
          </button>
        </div>
      ) : rows === null ? (
        <div className="space-y-2" aria-label="Loading transactions">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          <p className="text-xs text-muted" aria-live="polite">
            {filteredRows.length} of {orderedRows.length} {orderedRows.length === 1 ? "transaction" : "transactions"}
          </p>

          {orderedRows.length === 0 ? (
            <div className="rounded-lg border border-border/50 p-6 text-center text-sm text-muted">
              No transactions have been logged yet.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-lg border border-border/50 p-6 text-center text-sm text-muted">
              No transactions match those filters.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRows.map((row) => (
                <TransactionRow
                  key={row.id}
                  row={row}
                  fallbackCurrency={currency}
                  hideAmounts={hideAmounts}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
