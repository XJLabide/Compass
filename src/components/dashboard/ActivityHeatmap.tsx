"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";

import {
  dailyCollectionPath,
  sessionsPath,
} from "@/lib/db/paths";
import type { DailyDoc, SessionDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";

/**
 * 12-week activity heatmap (84 cells). Each cell encodes a day:
 *   - dim grey  → nothing logged
 *   - low       → check-in only
 *   - mid       → workout only
 *   - high      → both
 *
 * Placeholder visual when empty: full grid of dim cells, no flash of blank.
 */
export interface ActivityHeatmapProps {
  uid: string;
  timezone: string;
}

const WEEKS = 12;
const DAYS = WEEKS * 7;

function addDaysIso(date: string, delta: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return date;
  return new Date(t + delta * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function dailyHasAny(d: DailyDoc): boolean {
  return (
    d.bodyweightKg !== undefined ||
    d.sleepHours !== undefined ||
    d.calories !== undefined ||
    d.proteinG !== undefined ||
    d.waterMl !== undefined ||
    d.steps !== undefined ||
    d.mood !== undefined
  );
}

export default function ActivityHeatmap({
  uid,
  timezone,
}: ActivityHeatmapProps) {
  const [daily, setDaily] = useState<DailyDoc[] | null>(null);
  const [sessions, setSessions] = useState<SessionDoc[] | null>(null);

  const today = useMemo(
    () => computeLocalDate(new Date(), timezone || "UTC"),
    [timezone],
  );
  const windowStart = useMemo(() => addDaysIso(today, -(DAYS - 1)), [today]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      dailyCollectionPath(uid),
      where("localDate", ">=", windowStart),
      where("localDate", "<=", today),
      orderBy("localDate", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setDaily(snap.docs.map((d) => d.data())),
      () => setDaily([]),
    );
    return () => unsub();
  }, [uid, windowStart, today]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      sessionsPath(uid),
      where("localDate", ">=", windowStart),
      where("localDate", "<=", today),
      orderBy("localDate", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setSessions(snap.docs.map((d) => d.data())),
      () => setSessions([]),
    );
    return () => unsub();
  }, [uid, windowStart, today]);

  const loaded = daily !== null && sessions !== null;

  const cells = useMemo(() => {
    const dailySet = new Set<string>();
    const sessSet = new Set<string>();
    if (loaded) {
      for (const d of daily ?? []) {
        if (dailyHasAny(d)) dailySet.add(d.localDate);
      }
      for (const s of sessions ?? []) {
        if (s.status !== "discarded") sessSet.add(s.localDate);
      }
    }

    const out: { date: string; level: 0 | 1 | 2 | 3 }[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const date = addDaysIso(today, -i);
      const c = dailySet.has(date);
      const w = sessSet.has(date);
      const level: 0 | 1 | 2 | 3 = w && c ? 3 : w ? 2 : c ? 1 : 0;
      out.push({ date, level });
    }
    return out;
  }, [loaded, daily, sessions, today]);

  // Group into columns by week. We anchor the first cell's weekday to its
  // ISO weekday and pad the leading column so all columns are 7 cells tall.
  const columns = useMemo(() => {
    if (cells.length === 0) return [];
    const cols: { date: string; level: 0 | 1 | 2 | 3 }[][] = [];
    let col: { date: string; level: 0 | 1 | 2 | 3 }[] = [];
    cells.forEach((c) => {
      const dow = new Date(`${c.date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
      if (col.length === 0 && dow !== 0) {
        for (let i = 0; i < dow; i++) {
          col.push({ date: "", level: 0 });
        }
      }
      col.push(c);
      if (col.length === 7) {
        cols.push(col);
        col = [];
      }
    });
    if (col.length > 0) {
      while (col.length < 7) col.push({ date: "", level: 0 });
      cols.push(col);
    }
    return cols;
  }, [cells]);

  if (!loaded) {
    return (
      <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          Activity
        </div>
        <Skeleton className="mt-3 h-28 w-full" />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="activity-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="activity-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted"
        >
          Activity
        </h2>
        <span className="text-xs text-muted">last {WEEKS} weeks</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="flex gap-[3px]">
          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-[3px]">
              {col.map((cell, ri) => (
                <span
                  key={`${ci}-${ri}`}
                  title={cell.date || undefined}
                  className={cellClass(cell.level, cell.date === "")}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted">
        <span>Less</span>
        <span className={cellClass(0)} />
        <span className={cellClass(1)} />
        <span className={cellClass(2)} />
        <span className={cellClass(3)} />
        <span>More</span>
        <span className="ml-auto">check-in · workout · both</span>
      </div>
    </section>
  );
}

function cellClass(level: 0 | 1 | 2 | 3, empty = false): string {
  if (empty) return "h-3 w-3 rounded-sm bg-transparent";
  switch (level) {
    case 0:
      return "h-3 w-3 rounded-sm bg-neutral-800/70";
    case 1:
      return "h-3 w-3 rounded-sm bg-cyan-900/70";
    case 2:
      return "h-3 w-3 rounded-sm bg-cyan-700";
    case 3:
      return "h-3 w-3 rounded-sm bg-cyan-400";
  }
}
