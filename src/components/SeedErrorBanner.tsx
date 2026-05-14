"use client";

import { AlertTriangle } from "lucide-react";
import { useUserData } from "@/lib/data/UserDataProvider";

/**
 * Surfaces seed errors from UserDataProvider. Renders nothing when there's no
 * error, otherwise shows a dismissable banner with a Retry button.
 *
 * Only permanent errors (after retry-backoff exhaustion or non-transient codes
 * like permission-denied) reach this banner — transient offline/connection
 * blips retry silently.
 */
export default function SeedErrorBanner() {
  const { seedError, retrySeed } = useUserData();
  if (!seedError) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="mb-3 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
    >
      <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Setup didn&apos;t finish</div>
        <div className="mt-0.5 text-xs text-amber-200/80 break-all">
          {seedError}
        </div>
      </div>
      <button
        type="button"
        onClick={retrySeed}
        className="shrink-0 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-100 transition hover:bg-amber-400/20"
      >
        Retry
      </button>
    </div>
  );
}
