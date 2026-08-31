"use client";

import { useEffect, useState } from "react";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth/useAuth";
import { useActiveDay } from "@/lib/day/ActiveDayProvider";
import { sessionsPath } from "@/lib/db/paths";
import type { MatchOutcome, SessionDoc } from "@/lib/db/types";
import { X, Trophy } from "lucide-react";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import clsx from "clsx";

interface SportsLoggerModalProps {
  open: boolean;
  onClose: () => void;
  timezone?: string;
  initialSport?: string;
  onSuccess?: () => void;
}

const SPORTS_CATEGORIES = [
  { label: "Basketball", emoji: "🏀" },
  { label: "Soccer", emoji: "⚽" },
  { label: "Tennis", emoji: "🎾" },
  { label: "Swimming", emoji: "🏊" },
  { label: "Cycling", emoji: "🚴" },
  { label: "Badminton", emoji: "🏸" },
  { label: "Volleyball", emoji: "🏐" },
  { label: "Martial Arts", emoji: "🥊" },
  { label: "General Sports", emoji: "⚡" },
];

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;
}

export default function SportsLoggerModal({
  open,
  onClose,
  initialSport = "Basketball",
  onSuccess,
}: SportsLoggerModalProps) {
  useBodyScrollLock(open);

  const { user } = useAuth();
  const { activeDate, hasActiveDay } = useActiveDay();
  const [selectedSport, setSelectedSport] = useState(initialSport);
  const [gameType, setGameType] = useState<"casual" | "match">("casual");
  const [matchOutcome, setMatchOutcome] = useState<MatchOutcome>("win");
  const [score, setScore] = useState("");
  const [opponent, setOpponent] = useState("");
  const [durationMinStr, setDurationMinStr] = useState("60");
  const [intensity, setIntensity] = useState<"low" | "moderate" | "high">("moderate");
  const [caloriesStr, setCaloriesStr] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSport) setSelectedSport(initialSport);
  }, [initialSport, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) {
      setError("You need to be signed in before logging a sports activity.");
      return;
    }
    if (!hasActiveDay) {
      setError("Start your day before logging a sports activity.");
      return;
    }
    const durMin = parseFloat(durationMinStr) || 0;
    if (durMin <= 0) {
      setError("Please enter a valid workout duration.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const cals = parseFloat(caloriesStr) || undefined;

      const payload = withoutUndefined<Partial<SessionDoc>>({
        localDate: activeDate,
        name: selectedSport,
        activityType: "sports",
        sportName: selectedSport,
        gameType: gameType,
        matchOutcome: gameType === "match" ? matchOutcome : "none",
        score: gameType === "match" && score.trim() ? score.trim() : undefined,
        opponent: gameType === "match" && opponent.trim() ? opponent.trim() : undefined,
        intensity: intensity,
        status: "completed",
        sets: [],
        durationMin: Math.round(durMin),
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
      setError(err instanceof Error ? err.message : "Failed to log sports activity.");
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
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-500/10 text-purple-400">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-neutral-100">
                Log Sports & Recreation
              </h2>
              <p className="text-xs text-muted">Games, matches & team sports</p>
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
            <label className="block text-xs font-medium text-muted">Select Sport</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {SPORTS_CATEGORIES.map((sport) => {
                const active = selectedSport === sport.label;
                return (
                  <button
                    key={sport.label}
                    type="button"
                    onClick={() => setSelectedSport(sport.label)}
                    className={clsx(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-purple-500 bg-purple-500/15 text-purple-200"
                        : "border-border/60 bg-neutral-900/60 text-muted hover:bg-neutral-900 hover:text-neutral-200"
                    )}
                  >
                    <span>{sport.emoji}</span>
                    <span>{sport.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Game Type Switcher */}
          <div>
            <label className="block text-xs font-medium text-muted">Game Type</label>
            <div className="mt-1 flex rounded-xl border border-border bg-neutral-900 p-1">
              <button
                type="button"
                onClick={() => setGameType("casual")}
                className={clsx(
                  "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all",
                  gameType === "casual"
                    ? "bg-purple-500 text-neutral-950 shadow"
                    : "text-muted hover:text-neutral-200"
                )}
              >
                Casual Session
              </button>
              <button
                type="button"
                onClick={() => setGameType("match")}
                className={clsx(
                  "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all",
                  gameType === "match"
                    ? "bg-purple-500 text-neutral-950 shadow"
                    : "text-muted hover:text-neutral-200"
                )}
              >
                Competitive Match 🏆
              </button>
            </div>
          </div>

          {/* Competitive Match Fields */}
          {gameType === "match" && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-medium text-purple-300">
                  Match Outcome
                </label>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMatchOutcome("win")}
                    className={clsx(
                      "flex-1 rounded-lg border py-1.5 text-xs font-bold transition-all",
                      matchOutcome === "win"
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                        : "border-border/60 bg-neutral-900 text-muted"
                    )}
                  >
                    Win 🏆
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchOutcome("loss")}
                    className={clsx(
                      "flex-1 rounded-lg border py-1.5 text-xs font-bold transition-all",
                      matchOutcome === "loss"
                        ? "border-rose-500 bg-rose-500/20 text-rose-300"
                        : "border-border/60 bg-neutral-900 text-muted"
                    )}
                  >
                    Loss ❌
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchOutcome("draw")}
                    className={clsx(
                      "flex-1 rounded-lg border py-1.5 text-xs font-bold transition-all",
                      matchOutcome === "draw"
                        ? "border-amber-500 bg-amber-500/20 text-amber-300"
                        : "border-border/60 bg-neutral-900 text-muted"
                    )}
                  >
                    Draw 🤝
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="sports-score"
                    className="block text-[11px] font-medium text-muted"
                  >
                    Final Score (e.g. 21-18)
                  </label>
                  <input
                    id="sports-score"
                    type="text"
                    placeholder="21 - 18"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sports-opponent"
                    className="block text-[11px] font-medium text-muted"
                  >
                    Opponent / Team
                  </label>
                  <input
                    id="sports-opponent"
                    type="text"
                    placeholder="Eagles FC"
                    value={opponent}
                    onChange={(e) => setOpponent(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="sports-duration-min"
                className="block text-xs font-medium text-muted"
              >
                Duration (minutes)
              </label>
              <input
                id="sports-duration-min"
                type="number"
                step="1"
                min="1"
                inputMode="numeric"
                placeholder="60"
                value={durationMinStr}
                onChange={(e) => setDurationMinStr(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-purple-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                Intensity Level
              </label>
              <div className="mt-1 flex rounded-xl border border-border bg-neutral-900 p-1">
                {(["low", "moderate", "high"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setIntensity(lvl)}
                    className={clsx(
                      "flex-1 rounded-lg py-1.5 text-[11px] font-semibold capitalize transition-all",
                      intensity === lvl
                        ? "bg-purple-500 text-neutral-950 shadow"
                        : "text-muted hover:text-neutral-200"
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="sports-calories"
              className="block text-xs font-medium text-muted"
            >
              Est. Calories Burned (optional)
            </label>
            <input
              id="sports-calories"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              placeholder="450"
              value={caloriesStr}
              onChange={(e) => setCaloriesStr(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-purple-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="sports-notes"
              className="block text-xs font-medium text-muted"
            >
              Game Notes / Outcome
            </label>
            <textarea
              id="sports-notes"
              rows={2}
              placeholder="Full court pick-up game, won 3 games!"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-purple-500/60 focus:outline-none"
            />
          </div>

          {!hasActiveDay ? (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            >
              Start your day before logging a sports activity.
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
              className="inline-flex h-10 items-center justify-center rounded-xl bg-purple-500 px-5 text-xs font-semibold text-neutral-950 transition-all hover:bg-purple-400 disabled:opacity-50"
            >
              {submitting ? "Logging..." : "Log Sport Activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
