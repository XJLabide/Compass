"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import {
  exercisesPath,
  sessionsPath,
} from "@/lib/db/paths";
import type {
  Exercise,
  MuscleGroup,
  SessionDoc,
  UnitSystem,
} from "@/lib/db/types";
import { EXERCISE_MASTER } from "@/lib/data/exerciseMaster";
import { kgToDisplay, weightUnitLabel } from "@/lib/workout/units";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Last-30-days training volume broken out by primary muscle group.
 * Volume = sum(weightKg * reps) across logged sets, mapped through each
 * exercise's `primaryMuscle`.
 *
 * Placeholder: full-height bars rendering 0 with a "Log a session to see
 * your split" hint when no data yet.
 */
export interface VolumeByMuscleProps {
  uid: string;
  unitSystem: UnitSystem;
}

const WINDOW_DAYS = 30;

const MUSCLE_ORDER: MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
];

const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hams",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  forearms: "Forearms",
  other: "Other",
};

function addDaysIso(date: string, delta: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return date;
  return new Date(t + delta * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default function VolumeByMuscle({
  uid,
  unitSystem,
}: VolumeByMuscleProps) {
  const [sessions, setSessions] = useState<SessionDoc[] | null>(null);
  const [exMap, setExMap] = useState<Map<string, Exercise> | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const windowStart = useMemo(() => addDaysIso(today, -(WINDOW_DAYS - 1)), [
    today,
  ]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      sessionsPath(uid),
      where("localDate", ">=", windowStart),
      orderBy("localDate", "asc"),
      limit(200),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setSessions(snap.docs.map((d) => d.data())),
      () => setSessions([]),
    );
    return () => unsub();
  }, [uid, windowStart]);

  // One-shot fetch of exercises so we can look up primaryMuscle. Realtime
  // isn't needed — the master list is seed-only.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDocs(exercisesPath(uid));
        if (cancelled) return;
        // Seed map from master first so master exercise IDs always resolve,
        // then overlay Firestore docs so user customs/edits win on collision.
        const map = new Map<string, Exercise>();
        EXERCISE_MASTER.forEach((e) =>
          map.set(e.id, {
            name: e.name,
            primaryMuscle: e.primaryMuscle as Exercise["primaryMuscle"],
            category: e.category as Exercise["category"],
            seeded: true,
            createdAt: null as unknown as Exercise["createdAt"],
          }),
        );
        snap.docs.forEach((d) => map.set(d.id, d.data()));
        setExMap(map);
      } catch {
        if (cancelled) return;
        setExMap(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const loaded = sessions !== null && exMap !== null;

  const buckets = useMemo<Record<MuscleGroup, number>>(() => {
    const base = Object.fromEntries(
      MUSCLE_ORDER.map((m) => [m, 0]),
    ) as Record<MuscleGroup, number>;
    if (!loaded) return base;
    for (const s of sessions ?? []) {
      if (s.status === "discarded") continue;
      for (const set of s.sets ?? []) {
        const ex = exMap!.get(set.exerciseId);
        const muscle = ex?.primaryMuscle ?? "other";
        const vol = (set.weightKg ?? 0) * (set.reps ?? 0);
        base[muscle] = (base[muscle] ?? 0) + vol;
      }
    }
    return base;
  }, [loaded, sessions, exMap]);

  const max = Math.max(1, ...MUSCLE_ORDER.map((m) => buckets[m] ?? 0));
  const total = MUSCLE_ORDER.reduce((s, m) => s + (buckets[m] ?? 0), 0);
  const unit = weightUnitLabel(unitSystem);

  if (!loaded) {
    return (
      <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          Volume by muscle
        </div>
        <Skeleton className="mt-3 h-44 w-full" />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="vol-by-muscle-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="vol-by-muscle-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted"
        >
          Volume by muscle
        </h2>
        <span className="text-xs text-muted">last {WINDOW_DAYS} days</span>
      </div>

      <ul className="mt-3 space-y-2">
        {MUSCLE_ORDER.map((m) => {
          const raw = buckets[m] ?? 0;
          const display = kgToDisplay(raw, unitSystem);
          const pct = (raw / max) * 100;
          return (
            <li key={m} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-xs text-muted">
                {MUSCLE_LABEL[m]}
              </span>
              <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-neutral-800/70">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-accent/70"
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-neutral-200">
                {raw === 0
                  ? "—"
                  : `${Math.round(display).toLocaleString()} ${unit}`}
              </span>
            </li>
          );
        })}
      </ul>

      {total === 0 ? (
        <p className="mt-3 text-xs text-muted">
          Log a session to see your training split.
        </p>
      ) : null}
    </section>
  );
}
