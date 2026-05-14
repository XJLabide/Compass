"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";

import { dailyCollectionPath } from "@/lib/db/paths";
import type { DailyDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Consistency card — shows what fraction of the last 14 days the user hit
 * three minimums:
 *   1. Logged protein (count days with proteinG > 0)
 *   2. Hit protein target (count days with proteinG >= target, if target set)
 *   3. Slept >= 7h
 *
 * Placeholder rings render at 0% when nothing logged yet so the layout doesn't
 * collapse.
 */
export interface ConsistencyCardProps {
  uid: string;
  timezone: string;
  proteinTargetG: number;
}

const WINDOW_DAYS = 14;
const SLEEP_FLOOR = 7;

function addDaysIso(date: string, delta: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return date;
  return new Date(t + delta * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

interface Ratio {
  hit: number;
  total: number;
}

function pct({ hit, total }: Ratio): number {
  if (total === 0) return 0;
  return Math.round((hit / total) * 100);
}

function Ring({
  label,
  ratio,
  active,
}: {
  label: string;
  ratio: Ratio;
  active: boolean;
}) {
  const percent = pct(ratio);
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (c * percent) / 100;
  const stroke = active ? "stroke-accent" : "stroke-neutral-700";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        viewBox="0 0 56 56"
        className="h-14 w-14 -rotate-90"
        aria-hidden
      >
        <circle
          cx="28"
          cy="28"
          r={r}
          className="fill-none stroke-neutral-800"
          strokeWidth={6}
        />
        <circle
          cx="28"
          cy="28"
          r={r}
          className={`fill-none ${stroke} transition-[stroke-dashoffset] duration-300`}
          strokeWidth={6}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="text-center">
        <div className="text-sm font-semibold text-neutral-100">
          {percent}%
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted">
          {label}
        </div>
      </div>
    </div>
  );
}

export default function ConsistencyCard({
  uid,
  timezone,
  proteinTargetG,
}: ConsistencyCardProps) {
  const [docs, setDocs] = useState<DailyDoc[] | null>(null);

  const today = useMemo(
    () => computeLocalDate(new Date(), timezone || "UTC"),
    [timezone],
  );
  const windowStart = useMemo(() => addDaysIso(today, -(WINDOW_DAYS - 1)), [
    today,
  ]);

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
      (snap) => setDocs(snap.docs.map((d) => d.data())),
      () => setDocs([]),
    );
    return () => unsub();
  }, [uid, windowStart, today]);

  if (docs === null) {
    return (
      <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          Consistency
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </section>
    );
  }

  const loggedProtein: Ratio = {
    hit: docs.filter((d) => (d.proteinG ?? 0) > 0).length,
    total: WINDOW_DAYS,
  };
  const hitProtein: Ratio = {
    hit:
      proteinTargetG > 0
        ? docs.filter((d) => (d.proteinG ?? 0) >= proteinTargetG).length
        : 0,
    total: WINDOW_DAYS,
  };
  const slept7: Ratio = {
    hit: docs.filter((d) => (d.sleepHours ?? 0) >= SLEEP_FLOOR).length,
    total: WINDOW_DAYS,
  };

  return (
    <section
      aria-labelledby="consistency-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="consistency-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted"
        >
          Consistency
        </h2>
        <span className="text-xs text-muted">last {WINDOW_DAYS} days</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Ring
          label="Logged"
          ratio={loggedProtein}
          active={loggedProtein.hit > 0}
        />
        <Ring
          label={proteinTargetG > 0 ? "Protein" : "Protein —"}
          ratio={hitProtein}
          active={proteinTargetG > 0 && hitProtein.hit > 0}
        />
        <Ring
          label={`Sleep ≥${SLEEP_FLOOR}h`}
          ratio={slept7}
          active={slept7.hit > 0}
        />
      </div>

      {proteinTargetG === 0 ? (
        <p className="mt-3 text-[11px] text-muted">
          Set a protein target in settings to track this ring.
        </p>
      ) : null}
    </section>
  );
}
