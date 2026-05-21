"use client";

import Link from "next/link";
import { ChevronRight, Dumbbell } from "lucide-react";

import type { LoggedSet, SessionDoc, UnitSystem } from "@/lib/db/types";
import {
  kgToDisplay,
  roundDisplayWeight,
  weightUnitLabel,
} from "@/lib/workout/units";

/**
 * Compact "last session" recap card for the workout landing page.
 *
 * Click target: routes to `/workout/[id]` — the same logger page handles both
 * `in_progress` and `completed` sessions (it switches to a read-only summary
 * when status is completed).
 */

export interface LastSessionCardProps {
  /** `null` when no session has been logged yet (empty state). */
  session: { id: string; doc: SessionDoc } | null;
  unitSystem?: UnitSystem;
}

/** Pull a Date out of any Firestore Timestamp-shaped value, tolerant of nulls. */
function toMillis(ts: unknown): number | null {
  if (!ts) return null;
  const t = ts as { toMillis?: () => number; toDate?: () => Date };
  if (typeof t.toMillis === "function") {
    try {
      return t.toMillis();
    } catch {
      return null;
    }
  }
  if (typeof t.toDate === "function") {
    try {
      return t.toDate().getTime();
    } catch {
      return null;
    }
  }
  return null;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function sessionVolume(session: SessionDoc): number {
  const sets = session.sets;
  if (!Array.isArray(sets) || sets.length === 0) return 0;
  let total = 0;
  for (const s of sets as LoggedSet[]) {
    if (s.placeholder) continue;
    const w = Number(s.weightKg);
    const r = Number(s.reps);
    if (!Number.isFinite(w) || !Number.isFinite(r)) continue;
    total += w * r;
  }
  return total;
}

function countDistinctExercises(session: SessionDoc): number {
  if (Array.isArray(session.plannedExercises) && session.plannedExercises.length > 0) {
    return session.plannedExercises.length;
  }
  const ids = new Set<string>();
  for (const s of (session.sets as LoggedSet[] | undefined) ?? []) {
    if (!s) continue;
    if (s.exerciseId) ids.add(s.exerciseId);
  }
  return ids.size;
}

export default function LastSessionCard({
  session,
  unitSystem = "imperial",
}: LastSessionCardProps) {
  if (!session) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-neutral-900/20 px-4 py-5 text-center text-sm text-muted">
        No sessions logged yet — start one above.
      </div>
    );
  }

  const { id, doc } = session;
  const startedMs = toMillis(doc.startedAt);
  const finishedMs = toMillis(doc.finishedAt);
  const durationLabel =
    startedMs && finishedMs && finishedMs > startedMs
      ? formatDuration(finishedMs - startedMs)
      : typeof doc.durationMin === "number"
        ? `${doc.durationMin}:00`
        : "—";

  const volumeKg = sessionVolume(doc);
  const unit = weightUnitLabel(unitSystem);
  const volumeDisplay = roundDisplayWeight(kgToDisplay(volumeKg, unitSystem));
  const volumeLabel = volumeDisplay
    ? `${volumeDisplay.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${unit}`
    : `0 ${unit}`;

  const exerciseCount = countDistinctExercises(doc);

  return (
    <Link
      href={`/workout/${id}`}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-panel/60 px-4 py-3.5 transition hover:bg-neutral-900/60"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Dumbbell aria-hidden="true" className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-100">
          {doc.name || "Session"}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {doc.localDate}
          <span aria-hidden="true"> · </span>
          {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-neutral-100">
          {durationLabel}
        </p>
        <p className="mt-0.5 text-xs text-muted">{volumeLabel}</p>
      </div>
      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-muted/70 transition group-hover:text-neutral-100"
      />
    </Link>
  );
}
