"use client";

import { useActiveDay } from "@/lib/day/ActiveDayProvider";

export default function StartDayPrompt({
  scope = "daily logs",
}: {
  scope?: string;
}) {
  const { actualDate, startDay, saving, error } = useActiveDay();

  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-5">
      <h2 className="text-base font-semibold text-neutral-100">Start your day</h2>
      <p className="mt-1 text-sm text-muted">
        Start {actualDate} before adding {scope}.
      </p>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      <button
        type="button"
        onClick={() => void startDay()}
        disabled={saving}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Starting..." : "Start My Day"}
      </button>
    </section>
  );
}
