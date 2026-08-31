"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Trash2,
  Edit2,
  PieChart as PieIcon,
  RefreshCw,
  DollarSign,
} from "lucide-react";

import { holdingPath, portfolioPath } from "@/lib/db/paths";
import type { HoldingCategory, PortfolioHoldingDoc } from "@/lib/db/types";
import CompassLoader from "@/components/ui/CompassLoader";
import { formatCurrencyAmount } from "@/lib/money/currency";
import { isLegacySeededPortfolioHolding } from "@/lib/money/legacyFinanceSeeds";

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  name?: string;
  currency?: string;
  updatedAt: number;
}

export interface HoldingRow {
  id: string;
  data: PortfolioHoldingDoc & { usdAmount?: number };
}

export default function PortfolioTab({
  uid,
  userCurrency = "PHP",
  hideAmounts = false,
}: {
  uid: string;
  userCurrency?: string;
  hideAmounts?: boolean;
}) {
  const [holdings, setHoldings] = useState<HoldingRow[] | null>(null);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [usdToPhpRate, setUsdToPhpRate] = useState<number>(58.5);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [usdAmount, setUsdAmount] = useState("");
  const [shares, setShares] = useState("");
  const [category, setCategory] = useState<HoldingCategory>("etf");
  const [saving, setSaving] = useState(false);

  // 1. Subscribe to user's portfolio holdings
  useEffect(() => {
    setHoldings(null);
    setQuotes({});
    if (!uid) return;
    const unsub = onSnapshot(portfolioPath(uid), (snap) => {
      const rows = snap.docs.flatMap((d) => {
        const data = d.data() as PortfolioHoldingDoc & { usdAmount?: number };
        if (isLegacySeededPortfolioHolding(data)) {
          void deleteDoc(d.ref);
          return [];
        }
        return [{ id: d.id, data }];
      });
      setHoldings(rows);
    });
    return unsub;
  }, [uid]);

  // 2. Fetch live stock quotes & live USD->PHP rate
  const fetchQuotes = useCallback(async (symbolList: string[]) => {
    if (symbolList.length === 0) return;
    setLoadingQuotes(true);
    try {
      const res = await fetch(
        `/api/finance/quote?symbols=${encodeURIComponent(symbolList.join(","))}`,
      );
      if (res.ok) {
        const json = await res.json();
        if (json?.quotes) {
          setQuotes(json.quotes);
        }
        if (json?.usdToPhpRate && json.usdToPhpRate > 0) {
          setUsdToPhpRate(json.usdToPhpRate);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to fetch quotes:", err);
    } finally {
      setLoadingQuotes(false);
    }
  }, []);

  useEffect(() => {
    if (!holdings || holdings.length === 0) return;
    const symbols = Array.from(new Set(holdings.map((h) => h.data.ticker)));

    // Initial fetch
    void fetchQuotes(symbols);

    // Live auto-polling every 10 seconds for real-time market updates
    const intervalId = setInterval(() => {
      void fetchQuotes(symbols);
    }, 10_000);

    // Refetch live quotes when user returns to window/tab
    const onFocus = () => {
      void fetchQuotes(symbols);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [holdings, fetchQuotes]);

  // 3. Compute portfolio totals & daily P&L in Pesos
  const portfolioStats = useMemo(() => {
    if (!holdings) return { totalValueInPhp: 0, todayChangeInPhp: 0, todayChangePct: 0, totalUsd: 0 };
    let totalUsd = 0;
    let todayChangeUsd = 0;

    for (const h of holdings) {
      const q = quotes[h.data.ticker];
      const usdPrice = q?.price ?? 100;
      const usdChange = q?.change ?? 0;

      // Position USD value: priority to USD amount, fallback to shares * usdPrice
      let posUsd = 0;
      let posShares = 0;

      if (h.data.usdAmount !== undefined && h.data.usdAmount !== null && h.data.usdAmount > 0) {
        posUsd = h.data.usdAmount;
        posShares = usdPrice > 0 ? posUsd / usdPrice : h.data.shares ?? 0;
      } else if (h.data.shares !== undefined && h.data.shares !== null && h.data.shares > 0) {
        posShares = h.data.shares;
        posUsd = posShares * usdPrice;
      }

      totalUsd += posUsd;
      todayChangeUsd += usdChange * posShares;
    }

    const rate = userCurrency === "PHP" ? usdToPhpRate : 1;
    const totalValueInPhp = totalUsd * rate;
    const todayChangeInPhp = todayChangeUsd * rate;

    const previousTotalUsd = totalUsd - todayChangeUsd;
    const todayChangePct = previousTotalUsd > 0 ? (todayChangeUsd / previousTotalUsd) * 100 : 0;

    return { totalValueInPhp, todayChangeInPhp, todayChangePct, totalUsd };
  }, [holdings, quotes, usdToPhpRate, userCurrency]);

  // 4. Asset category distribution
  const allocation = useMemo(() => {
    if (!holdings) return [];
    const catMap: Record<string, number> = {};
    let totalUsd = 0;

    for (const h of holdings) {
      const q = quotes[h.data.ticker];
      const usdPrice = q?.price ?? 100;
      let posUsd = 0;

      if (h.data.usdAmount !== undefined && h.data.usdAmount !== null && h.data.usdAmount > 0) {
        posUsd = h.data.usdAmount;
      } else if (h.data.shares !== undefined && h.data.shares !== null) {
        posUsd = h.data.shares * usdPrice;
      }

      const cat = h.data.category || "other";
      catMap[cat] = (catMap[cat] || 0) + posUsd;
      totalUsd += posUsd;
    }

    return Object.entries(catMap).map(([cat, val]) => ({
      category: cat,
      value: val,
      percent: totalUsd > 0 ? (val / totalUsd) * 100 : 0,
    }));
  }, [holdings, quotes]);

  const openAddModal = () => {
    setEditingId(null);
    setTicker("");
    setName("");
    setUsdAmount("");
    setShares("");
    setCategory("etf");
    setModalOpen(true);
  };

  const openEditModal = (h: HoldingRow) => {
    setEditingId(h.id);
    setTicker(h.data.ticker);
    setName(h.data.name);
    const q = quotes[h.data.ticker];
    const usdPrice = q?.price ?? 100;

    if (h.data.usdAmount !== undefined && h.data.usdAmount !== null && h.data.usdAmount > 0) {
      setUsdAmount(h.data.usdAmount.toString());
      setShares((h.data.usdAmount / (usdPrice || 1)).toFixed(4));
    } else if (h.data.shares !== undefined && h.data.shares !== null) {
      setShares(h.data.shares.toString());
      setUsdAmount((h.data.shares * usdPrice).toFixed(2));
    }

    setCategory(h.data.category || "etf");
    setModalOpen(true);
  };

  // Handle Add / Edit Holding
  const handleSaveHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !ticker) return;
    setSaving(true);
    try {
      const numUsd = parseFloat(usdAmount);
      const numShares = parseFloat(shares);

      const payload = {
        ticker: ticker.toUpperCase().trim(),
        name: name.trim() || ticker.toUpperCase().trim(),
        ...(Number.isFinite(numUsd) && numUsd > 0 ? { usdAmount: numUsd } : {}),
        ...(Number.isFinite(numShares) && numShares > 0 ? { shares: numShares } : {}),
        category,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await setDoc(holdingPath(uid, editingId), payload, { merge: true });
      } else {
        await addDoc(portfolioPath(uid), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      setModalOpen(false);
      setEditingId(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save holding:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!uid) return;
    try {
      await deleteDoc(holdingPath(uid, id));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete holding:", err);
    }
  };

  if (!holdings) {
    return <CompassLoader mode="card" size="lg" label="Loading Live Portfolio..." />;
  }

  const isGain = portfolioStats.todayChangeInPhp >= 0;

  return (
    <div className="space-y-6">
      {/* Portfolio Header Metric Card */}
      <div className="rounded-xl border border-border bg-neutral-900/60 p-5 backdrop-blur-md">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              Stock & ETF Portfolio Value
            </span>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-neutral-100">
              {formatCurrencyAmount(portfolioStats.totalValueInPhp, "PHP", 2, hideAmounts)}
            </h2>
            <span className="text-xs text-muted font-mono mt-0.5 block">
              {hideAmounts
                ? "$ •••••• USD"
                : `$${portfolioStats.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`}{" "}
              · Live Rate: 1 USD = ₱{usdToPhpRate.toFixed(2)} PHP
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const symbols = Array.from(new Set(holdings.map((h) => h.data.ticker)));
                void fetchQuotes(symbols);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-neutral-800 text-muted transition hover:text-neutral-100"
              title="Refresh Quotes"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingQuotes ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={openAddModal}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Position
            </button>
          </div>
        </div>

        {/* Daily P&L Badge */}
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isGain
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
            }`}
          >
            {isGain ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {isGain ? "+" : ""}
            {formatCurrencyAmount(portfolioStats.todayChangeInPhp, "PHP", 2, hideAmounts)} (
            {isGain ? "+" : ""}
            {portfolioStats.todayChangePct.toFixed(2)}%)
          </span>
          <span className="text-xs text-muted">Today&apos;s Market Change</span>
        </div>
      </div>

      {/* Asset Allocation & Holdings Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Holdings List (2 Columns) */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-200">Your Holdings</h3>
            <span className="text-xs text-muted">{holdings.length} Positions</span>
          </div>

          <div className="space-y-2">
            {holdings.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-neutral-900/30 p-6 text-center text-xs text-muted">
                No portfolio positions yet.
              </div>
            ) : holdings.map((h) => {
              const q = quotes[h.data.ticker];
              const usdPrice = q?.price ?? 100;
              const changePct = q?.changePercent ?? 0;
              const isPos = changePct >= 0;

              let posUsd = 0;
              let calculatedShares = 0;

              if (h.data.usdAmount !== undefined && h.data.usdAmount !== null && h.data.usdAmount > 0) {
                posUsd = h.data.usdAmount;
                calculatedShares = usdPrice > 0 ? parseFloat((posUsd / usdPrice).toFixed(4)) : 0;
              } else if (h.data.shares !== undefined && h.data.shares !== null) {
                calculatedShares = h.data.shares;
                posUsd = calculatedShares * usdPrice;
              }

              const posPhp = posUsd * usdToPhpRate;

              return (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-neutral-900/40 p-4 transition hover:bg-neutral-800/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 font-bold uppercase text-purple-300 text-xs">
                      {h.data.ticker.slice(0, 4)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-100">{h.data.ticker}</span>
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase text-muted font-mono">
                          {h.data.category}
                        </span>
                      </div>
                      <p className="text-xs text-muted truncate max-w-[180px] sm:max-w-[240px]">
                        {h.data.name} · <span className="font-semibold text-neutral-200">{calculatedShares} shares</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-base font-bold text-neutral-100">
                        {formatCurrencyAmount(posPhp, "PHP", 2, hideAmounts)}
                      </p>
                      <p className="text-[11px] text-muted">
                        {hideAmounts ? "$ •••••• USD" : `$${posUsd.toFixed(2)} USD`}
                      </p>
                      {usdPrice > 0 ? (
                        <p className={`text-[10px] font-medium ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                          ${usdPrice.toFixed(2)} ({isPos ? "+" : ""}
                          {changePct.toFixed(2)}%)
                        </p>
                      ) : null}
                    </div>

                    <button
                      onClick={() => openEditModal(h)}
                      className="text-muted hover:text-cyan-400 transition p-1.5 rounded-md hover:bg-neutral-800"
                      title="Edit USD amount or shares"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="text-muted hover:text-rose-400 transition p-1.5 rounded-md hover:bg-neutral-800"
                      title="Remove position"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Asset Allocation Card */}
        <div className="rounded-xl border border-border bg-neutral-900/40 p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <PieIcon className="h-4 w-4 text-purple-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
              Asset Allocation
            </h3>
          </div>

          <div className="space-y-3">
            {allocation.map((item) => (
              <div key={item.category} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="capitalize text-neutral-300">{item.category}</span>
                  <span className="text-neutral-100 font-semibold">{item.percent.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full ${
                      item.category === "etf"
                        ? "bg-purple-500"
                        : item.category === "stock"
                        ? "bg-cyan-400"
                        : item.category === "crypto"
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                    }`}
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add / Edit Holding Modal */}
      {modalOpen && (
        <div className="ui-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="ui-centered-panel w-full max-w-md rounded-lg border border-border bg-neutral-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-neutral-100">
              {editingId ? `Edit ${ticker} Position` : "Add Stock or ETF Position"}
            </h3>

            <form onSubmit={handleSaveHolding} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted">Ticker Symbol</label>
                <input
                  type="text"
                  required
                  placeholder="Ticker symbol"
                  value={ticker}
                  onChange={(e) => {
                    const sym = e.target.value.toUpperCase();
                    setTicker(sym);
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted">Display Name</label>
                <input
                  type="text"
                  placeholder="Display name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* PRIMARY FIELD: USD Amount in Brokerage Wallet */}
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  USD Amount in Brokerage Wallet ($ USD)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={usdAmount}
                  onChange={(e) => {
                    const amt = e.target.value;
                    setUsdAmount(amt);
                    const q = quotes[ticker];
                    if (parseFloat(amt) > 0 && q?.price) {
                      setShares((parseFloat(amt) / q.price).toFixed(4));
                    }
                  }}
                  className="w-full rounded-lg border border-cyan-500/40 bg-neutral-950 px-3 py-2 text-xl font-extrabold text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
                <p className="text-[11px] text-muted">
                  Live Conversion: = {formatCurrencyAmount((parseFloat(usdAmount) || 0) * usdToPhpRate, "PHP")} (1 USD = ₱{usdToPhpRate.toFixed(2)} PHP)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted">Exact Calculated Shares</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.0000"
                    value={shares}
                    onChange={(e) => {
                      const s = e.target.value;
                      setShares(s);
                      const q = quotes[ticker];
                      if (parseFloat(s) > 0 && q?.price) {
                        setUsdAmount((parseFloat(s) * q.price).toFixed(2));
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent font-semibold"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as HoldingCategory)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="etf">ETF</option>
                    <option value="stock">Stock</option>
                    <option value="crypto">Crypto</option>
                    <option value="cash">Cash Asset</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
                >
                  {saving ? "Saving..." : editingId ? "Update Position" : "Add Position"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
