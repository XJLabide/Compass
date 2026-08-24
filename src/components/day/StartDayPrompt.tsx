"use client";

import { useActiveDay } from "@/lib/day/ActiveDayProvider";

export default function StartDayPrompt({
  scope = "daily logs",
}: {
  scope?: string;
}) {
  const { actualDate, startDay, saving, error } = useActiveDay();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-day-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
    >
      <section className="w-full max-w-sm rounded-lg border border-border bg-panel p-5">
        <h2 id="start-day-title" className="text-lg font-semibold text-neutral-100">
          Start your day
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Start {actualDate} before adding {scope}.
        </p>
        {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        <button
          type="button"
          onClick={() => void startDay()}
          disabled={saving}
          className="mt-5 h-10 w-full rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Starting..." : "Start My Day"}
        </button>
      </section>
    </div>
  );
}
