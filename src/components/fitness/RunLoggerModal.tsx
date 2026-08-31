"use client";

import { useEffect, useState } from "react";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth/useAuth";
import { useActiveDay } from "@/lib/day/ActiveDayProvider";
import { sessionsPath } from "@/lib/db/paths";
import type { RunType, SessionDoc } from "@/lib/db/types";
import { X, Timer, Navigation, Flame } from "lucide-react";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import clsx from "clsx";

interface RunLoggerModalProps {
  open: boolean;
  onClose: () => void;
  timezone?: string;
  initialRunType?: RunType;
  onSuccess?: () => void;
}

const RUN_PRESETS: { type: RunType; label: string; emoji: string; defaultDist: string; defaultDur: string }[] = [
  { type: "easy", label: "Easy Run", emoji: "🟢", defaultDist: "5.0", defaultDur: "30" },
  { type: "tempo", label: "5K Tempo", emoji: "🔵", defaultDist: "5.0", defaultDur: "24" },
  { type: "intervals", label: "Interval Sprints", emoji: "🟣", defaultDist: "4.0", defaultDur: "25" },
  { type: "long_run", label: "Long Run", emoji: "🟡", defaultDist: "10.0", defaultDur: "60" },
  { type: "general", label: "General", emoji: "🏃", defaultDist: "", defaultDur: "" },
];

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;
}

export default function RunLoggerModal({
  open,
  onClose,
  initialRunType = "general",
  onSuccess,
}: RunLoggerModalProps) {
  useBodyScrollLock(open);

  const { user } = useAuth();
  const { activeDate, hasActiveDay } = useActiveDay();
  const [runType, setRunType] = useState<RunType>(initialRunType);
  const [distanceStr, setDistanceStr] = useState("");
  const [durationMinStr, setDurationMinStr] = useState("");
  const [caloriesStr, setCaloriesStr] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRunType) {
      setRunType(initialRunType);
      const preset = RUN_PRESETS.find((p) => p.type === initialRunType);
      if (preset && preset.defaultDist) {
        setDistanceStr(preset.defaultDist);
        setDurationMinStr(preset.defaultDur);
      }
    }
  }, [initialRunType, open]);

  if (!open) return null;

  const distKm = parseFloat(distanceStr) || 0;
  const durMin = parseFloat(durationMinStr) || 0;

  // Calculate pace min/km
  const paceMinPerKm = distKm > 0 && durMin > 0 ? durMin / distKm : 0;
  const paceMinutes = Math.floor(paceMinPerKm);
  const paceSeconds = Math.round((paceMinPerKm - paceMinutes) * 60);
  const paceFormatted =
    distKm > 0 && durMin > 0
      ? `${paceMinutes}:${paceSeconds < 10 ? "0" : ""}${paceSeconds} /km`
      : "--:-- /km";

  const handleSelectPreset = (presetType: RunType) => {
    setRunType(presetType);
    const p = RUN_PRESETS.find((item) => item.type === presetType);
    if (p && p.defaultDist) {
      setDistanceStr(p.defaultDist);
      setDurationMinStr(p.defaultDur);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) {
      setError("You need to be signed in before logging a run.");
      return;
    }
    if (!hasActiveDay) {
      setError("Start your day before logging a run.");
      return;
    }
    if (distKm <= 0 && durMin <= 0) {
      setError("Please enter a valid distance or duration.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const cals = parseFloat(caloriesStr) || undefined;
      const presetObj = RUN_PRESETS.find((p) => p.type === runType);
      const sessionName = presetObj ? presetObj.label : "Run";

      const payload = withoutUndefined<Partial<SessionDoc>>({
        localDate: activeDate,
        name: sessionName,
        activityType: "running",
        runType: runType,
        status: "completed",
        sets: [],
        durationMin: durMin > 0 ? Math.round(durMin) : undefined,
        distanceKm: distKm > 0 ? distKm : undefined,
        paceMinPerKm: paceMinPerKm > 0 ? Math.round(paceMinPerKm * 100) / 100 : undefined,
        caloriesBurned: cals,
        notes: notes.trim() || undefined,
        date: serverTimestamp() as unknown as SessionDoc["date"],
        startedAt: serverTimestamp() as unknown as SessionDoc["startedAt"],
        finishedAt: serverTimestamp() as unknown as SessionDoc["finishedAt"],
        createdAt: serverTimestamp() as unknown as SessionDoc["createdAt"],
        updatedAt: serverTimestamp() as unknown as SessionDoc["updatedAt"],
      });

      await addDoc(sessionsPath(user.uid), payload as SessionDoc);
      setSubmitting(false);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log run.");
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="ui-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="ui-bottom-sheet w-full max-w-md rounded-t-lg border border-border bg-neutral-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400">
              <Navigation className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-neutral-100">
                Log Running Activity
              </h2>
              <p className="text-xs text-muted">Cardio & Outdoor tracking</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="ui-icon-pressable rounded-lg p-1.5 text-muted hover:bg-neutral-900 hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-muted">Run Type</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {RUN_PRESETS.map((p) => {
                const active = runType === p.type;
                return (
                  <button
                    key={p.type}
                    type="button"
                    onClick={() => handleSelectPreset(p.type)}
                    className={clsx(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                        : "border-border/60 bg-neutral-900/60 text-muted hover:bg-neutral-900 hover:text-neutral-200"
                    )}
                  >
                    <span>{p.emoji}</span>
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="run-distance-km"
                className="block text-xs font-medium text-muted"
              >
                Distance (km)
              </label>
              <input
                id="run-distance-km"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="5.00"
                value={distanceStr}
                onChange={(e) => setDistanceStr(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="run-duration-min"
                className="block text-xs font-medium text-muted"
              >
                Duration (min)
              </label>
              <input
                id="run-duration-min"
                type="number"
                step="1"
                min="1"
                inputMode="numeric"
                placeholder="25"
                value={durationMinStr}
                onChange={(e) => setDurationMinStr(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Pace Preview Card */}
          <div className="flex items-center justify-between rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-medium text-muted">Average Pace</span>
            </div>
            <span className="text-sm font-semibold text-cyan-300">
              {paceFormatted}
            </span>
          </div>

          <div>
            <label
              htmlFor="run-calories"
              className="block text-xs font-medium text-muted"
            >
              Est. Calories (kcal)
            </label>
            <input
              id="run-calories"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              placeholder="350"
              value={caloriesStr}
              onChange={(e) => setCaloriesStr(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-cyan-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="run-notes"
              className="block text-xs font-medium text-muted"
            >
              Notes / Route
            </label>
            <textarea
              id="run-notes"
              rows={2}
              placeholder="Morning trail run, felt great!"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-cyan-500/60 focus:outline-none"
            />
          </div>

          {!hasActiveDay ? (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            >
              Start your day before logging a run.
            </div>
          ) : null}

          <div className="mt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl px-4 text-xs font-medium text-muted hover:bg-neutral-900 hover:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !hasActiveDay}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-cyan-500 px-5 text-xs font-semibold text-neutral-950 transition-all hover:bg-cyan-400 disabled:opacity-50"
            >
              {submitting ? "Logging..." : "Log Run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
