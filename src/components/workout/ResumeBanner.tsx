"use client";

import { useState } from "react";
import Link from "next/link";

import type { SessionDoc } from "@/lib/db/types";
import { discardInProgressSession } from "@/lib/workout/recovery";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface ResumeBannerProps {
  uid: string;
  /** The most recent in-progress session, if any. */
  inProgress: { id: string; session: SessionDoc } | null;
}

/**
 * Banner shown on `/workout` when an in-progress session exists.
 *
 * "Resume" routes to `/workout/[id]` (the live logger).
 * "Discard" flips the session's `status` to `'discarded'` so it stops
 * surfacing in the banner and in the recent feed.
 */
export default function ResumeBanner({ uid, inProgress }: ResumeBannerProps) {
  const [discarding, setDiscarding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!inProgress) return null;

  const { id, session } = inProgress;
  const label = session.name || "Session";
  const setsCount = (session.sets ?? []).filter(
    (s) => !(s.weightKg === 0 && s.reps === 0),
  ).length;

  const handleDiscard = async () => {
    setConfirmOpen(false);
    if (discarding) return;
    setDiscarding(true);
    setError(null);
    try {
      await discardInProgressSession(uid, id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to discard session.";
      setError(message);
      setDiscarding(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Resume in-progress session"
      className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-amber-300">
            In progress
          </p>
          <p className="mt-1 text-base font-semibold text-neutral-100">
            {label}
          </p>
          <p className="mt-1 text-xs text-muted">
            {session.localDate}
            <span aria-hidden="true"> · </span>
            {setsCount} {setsCount === 1 ? "set" : "sets"} logged
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/workout/${id}`}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-neutral-900 transition hover:brightness-110"
        >
          Resume
        </Link>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={discarding}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-neutral-900/40 px-4 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900/70 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {discarding ? "Discarding…" : "Discard"}
        </button>
      </div>
      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        title="Discard this session?"
        description="Logged sets will be hidden from the recent list. This can't be undone."
        confirmLabel="Discard"
        busy={discarding}
        onConfirm={handleDiscard}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
