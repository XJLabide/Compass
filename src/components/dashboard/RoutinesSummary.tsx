"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowRight, Repeat } from "lucide-react";

import { routinesPath } from "@/lib/db/paths";
import type { RoutineDoc } from "@/lib/db/types";
import { useUserData } from "@/lib/data/UserDataProvider";
import {
  dowOfIso,
  groupRoutinesByBlock,
  resolveTimeBlocks,
} from "@/lib/routines/helpers";
import { BlockIcon } from "@/components/todos/TimeBlockManager";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";

export interface RoutinesSummaryProps {
  uid: string;
  timezone: string;
}

type Row = { id: string; data: RoutineDoc };

/**
 * Compact home-dashboard widget showing how many of today's scheduled routines
 * have been checked off. Tap-through to `/todos?tab=routines`.
 */
export default function RoutinesSummary({
  uid,
  timezone,
}: RoutinesSummaryProps) {
  const today = useMemo(
    () => computeLocalDate(new Date(), timezone || "UTC"),
    [timezone],
  );
  const todayDow = useMemo(() => dowOfIso(today), [today]);

  const { effectiveProfile } = useUserData();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    const q = query(routinesPath(uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
      () => setRows([]),
    );
    return () => unsub();
  }, [uid]);

  const blocksSummary = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const timeBlocks = resolveTimeBlocks(effectiveProfile ?? undefined);
    const groups = groupRoutinesByBlock(rows, timeBlocks);

    return groups
      .map(({ block, routines }) => {
        const scheduledToday = routines.filter(
          (r) => r.data.active && r.data.weekdays?.includes(todayDow),
        );
        const doneToday = scheduledToday.filter((r) => r.data.done?.[today]);
        return {
          block,
          scheduled: scheduledToday.length,
          done: doneToday.length,
        };
      })
      .filter((g) => g.scheduled > 0);
  }, [rows, effectiveProfile, todayDow, today]);

  const { scheduled, done } = useMemo(() => {
    let s = 0;
    let d = 0;
    for (const b of blocksSummary) {
      s += b.scheduled;
      d += b.done;
    }
    return { scheduled: s, done: d };
  }, [blocksSummary]);

  if (rows === null) {
    return (
      <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <Repeat aria-hidden className="h-4 w-4 text-accent" />
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
              Today&apos;s routines
            </h2>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </section>
    );
  }

  const empty = scheduled === 0;
  const pct = scheduled > 0 ? Math.round((done / scheduled) * 100) : 0;

  return (
    <section
      aria-labelledby="routines-summary-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <Repeat aria-hidden className="h-4 w-4 text-accent" />
          <h2
            id="routines-summary-heading"
            className="text-xs font-medium uppercase tracking-wide text-muted"
          >
            Today&apos;s routines
          </h2>
        </div>
        <Link
          href="/todos?tab=routines"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {empty ? (
        <p className="mt-3 text-[11px] text-muted">
          No routines scheduled for today. Add one in the Routines tab.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-neutral-100 tabular-nums">
              {done}
            </span>
            <span className="text-sm text-muted">/ {scheduled} done</span>
            <span className="ml-auto text-[11px] text-muted tabular-nums">
              {pct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800/70">
            <div
              className="h-full bg-accent/70 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {blocksSummary.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-2.5 gap-y-1.5 text-[10px] text-muted border-t border-border/20 pt-2.5">
              {blocksSummary.map(({ block, scheduled: bSched, done: bDone }) => (
                <div key={block.id} className="flex items-center gap-1">
                  <BlockIcon name={block.icon} className="h-3 w-3 text-accent" />
                  <span>
                    {block.label} <span className="text-neutral-300 font-medium">{bDone}/{bSched}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
