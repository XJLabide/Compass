"use client";

import { useActiveDay } from "@/lib/day/ActiveDayProvider";

export default function StartDayPrompt({
  scope = "daily logs",
}: {
  scope?: string;
}) {
  const { actualDate, timezone, startDay, saving, error } = useActiveDay();
  const displayDate = (() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        month: "long",
        day: "2-digit",
        weekday: "long",
      }).format(new Date(`${actualDate}T12:00:00Z`));
    } catch {
      return actualDate;
    }
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-day-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
    >
      <section className="w-full max-w-sm rounded-lg border border-border bg-panel p-5">
        <h2 id="start-day-title" className="text-lg font-semibold text-neutral-100">
          Hey, welcome back.
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Ready to start tracking {displayDate}? I&apos;ll keep your {scope} tied to this day until you end it.
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
