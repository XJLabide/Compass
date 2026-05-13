"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDocs, orderBy, query, where } from "firebase/firestore";

import { dailyCollectionPath, sessionsPath } from "@/lib/db/paths";
import type { DailyDoc, SessionDoc, UnitSystem } from "@/lib/db/types";
import {
  buildBodyweightSeries,
  buildDailyAvgSeries,
  buildWeeklyVolumeSeries,
  getTrendsWindow,
  type TrendPoint,
} from "@/lib/dashboard/trends";
import { kgToDisplay, weightUnitLabel } from "@/lib/workout/units";

import MiniChart, { type MiniChartPoint } from "@/components/dashboard/MiniChart";

/**
 * Dashboard Trends — four mini line charts across the last 8 weeks.
 *
 * Charts (in display order):
 *   1. Bodyweight (per weigh-in)
 *   2. Weekly training volume (sum of weight*reps per session, summed/week)
 *   3. Protein daily avg (g/day)
 *   4. Sleep daily avg (h/day)
 *
 * Fetch model: one-shot getDocs on mount + on tab focus. We deliberately do
 * NOT use realtime listeners here — the dashboard spec calls out a ~60-read
 * cap for the trends section, and an 8-week window of daily + sessions docs
 * comfortably fits. Realtime is reserved for TodayCard and ThisWeekCard.
 *
 * Empty-state rule (per task spec): when a series has fewer than 3 points,
 * render a "Log 3 entries to see your trend" placeholder instead of the
 * line. Avoids drawing a misleading single-dot chart on first run.
 *
 * Layout: 2-column grid on all viewports — four 16-line-tall cards fit
 * comfortably above the fold on a 6.1" phone alongside the rest of the page.
 */
export interface TrendsProps {
  uid: string;
  timezone: string;
  unitSystem: UnitSystem;
}

const MIN_POINTS = 3;

export default function Trends({ uid, timezone, unitSystem }: TrendsProps) {
  const [daily, setDaily] = useState<DailyDoc[] | null>(null);
  const [sessions, setSessions] = useState<SessionDoc[] | null>(null);

  // Window is recomputed once per (tz) and re-runs the fetch when it changes.
  // Tab focus triggers a refetch but reuses the same window for a stable
  // chart axis until the page unmounts (i.e., navigating away and back).
  const window = useMemo(
    () => getTrendsWindow(new Date(), timezone || "UTC"),
    [timezone],
  );

  const fetchAll = useCallback(async () => {
    if (!uid) return;
    try {
      const dailyQ = query(
        dailyCollectionPath(uid),
        where("localDate", ">=", window.startLocalDate),
        where("localDate", "<=", window.endLocalDate),
        orderBy("localDate", "asc"),
      );
      const sessionsQ = query(
        sessionsPath(uid),
        where("localDate", ">=", window.startLocalDate),
        where("localDate", "<=", window.endLocalDate),
        orderBy("localDate", "asc"),
      );
      const [dailySnap, sessionsSnap] = await Promise.all([
        getDocs(dailyQ),
        getDocs(sessionsQ),
      ]);
      setDaily(dailySnap.docs.map((d) => d.data()));
      setSessions(sessionsSnap.docs.map((d) => d.data()));
    } catch {
      // Swallow — the empty-state placeholders are the right fallback here
      // (a transient network error shouldn't blank the whole dashboard).
      setDaily((prev) => prev ?? []);
      setSessions((prev) => prev ?? []);
    }
  }, [uid, window.startLocalDate, window.endLocalDate]);

  // One-shot fetch on mount.
  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Refetch when the tab becomes visible again. This is the cheaper proxy
  // for the spec's "refresh on focus" — `visibilitychange` fires for both
  // tab-switches and OS-level wake, which is what we want.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchAll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchAll]);

  const loaded = daily !== null && sessions !== null;

  // Project the raw kg-based series into the user's display unit. The other
  // series (protein g, sleep h) are unit-stable across imperial/metric.
  const bodyweightSeries = useMemo<TrendPoint[]>(() => {
    if (!loaded) return [];
    const raw = buildBodyweightSeries(daily!, window);
    return raw.map((p) => ({
      localDate: p.localDate,
      value: kgToDisplay(p.value, unitSystem),
    }));
  }, [loaded, daily, window, unitSystem]);

  const volumeSeries = useMemo<TrendPoint[]>(() => {
    if (!loaded) return [];
    const raw = buildWeeklyVolumeSeries(sessions!, window);
    return raw.map((p) => ({
      localDate: p.localDate,
      value: kgToDisplay(p.value, unitSystem),
    }));
  }, [loaded, sessions, window, unitSystem]);

  const proteinSeries = useMemo<TrendPoint[]>(
    () => (loaded ? buildDailyAvgSeries(daily!, "proteinG", window) : []),
    [loaded, daily, window],
  );

  const sleepSeries = useMemo<TrendPoint[]>(
    () => (loaded ? buildDailyAvgSeries(daily!, "sleepHours", window) : []),
    [loaded, daily, window],
  );

  const weightUnit = weightUnitLabel(unitSystem);

  return (
    <section
      aria-labelledby="trends-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="trends-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted"
        >
          Trends
        </h2>
        <span className="text-xs text-muted">Last 8 weeks</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <TrendCell
          label="Bodyweight"
          unit={weightUnit}
          series={bodyweightSeries}
          loaded={loaded}
          latestDigits={1}
        />
        <TrendCell
          label="Volume / wk"
          unit={weightUnit}
          series={volumeSeries}
          loaded={loaded}
          latestDigits={0}
        />
        <TrendCell
          label="Protein"
          unit="g"
          series={proteinSeries}
          loaded={loaded}
          latestDigits={0}
        />
        <TrendCell
          label="Sleep"
          unit="h"
          series={sleepSeries}
          loaded={loaded}
          latestDigits={1}
        />
      </div>
    </section>
  );
}

interface TrendCellProps {
  label: string;
  unit: string;
  series: TrendPoint[];
  loaded: boolean;
  latestDigits: number;
}

function TrendCell({
  label,
  unit,
  series,
  loaded,
  latestDigits,
}: TrendCellProps) {
  const enough = series.length >= MIN_POINTS;
  const latest = series.length > 0 ? series[series.length - 1].value : null;
  const chartData = useMemo<MiniChartPoint[]>(
    () => series.map((p) => ({ x: p.localDate, y: p.value })),
    [series],
  );

  return (
    <div className="rounded-lg border border-border bg-neutral-900/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        <span className="text-sm font-semibold text-neutral-100">
          {!loaded
            ? "…"
            : latest === null
              ? "—"
              : `${latest.toFixed(latestDigits)} ${unit}`}
        </span>
      </div>
      <div className="mt-2">
        {!loaded ? (
          <div className="h-16 rounded bg-neutral-900/40" />
        ) : enough ? (
          <MiniChart data={chartData} />
        ) : (
          <div className="flex h-16 items-center justify-center rounded bg-neutral-900/40 px-2 text-center text-[11px] leading-tight text-muted">
            Log 3 entries to see your trend
          </div>
        )}
      </div>
    </div>
  );
}
