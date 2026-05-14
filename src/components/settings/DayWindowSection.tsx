"use client";

import { useCallback, useState } from "react";
import { serverTimestamp, setDoc } from "firebase/firestore";

import { useUserData } from "@/lib/data/UserDataProvider";
import { profilePath } from "@/lib/db/paths";
import {
  DEFAULT_BED_TIME,
  DEFAULT_WAKE_TIME,
} from "@/lib/today/timeOfDay";

/**
 * Settings panel: custom wake + bed times. Drives Today's awake-progress bar.
 * Both default to 07:00 / 23:00 when unset.
 */
export default function DayWindowSection() {
  const { uid, profile } = useUserData();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wake = profile?.wakeTime ?? DEFAULT_WAKE_TIME;
  const bed = profile?.bedTime ?? DEFAULT_BED_TIME;

  const persist = useCallback(
    async (patch: { wakeTime?: string; bedTime?: string }) => {
      if (!uid) return;
      setSaving(true);
      setError(null);
      try {
        await setDoc(
          profilePath(uid),
          { ...patch, updatedAt: serverTimestamp() },
          { merge: true },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [uid],
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted">
        Drives the awake-progress bar on the Today page. Bedtime before wake
        time is allowed and treated as a night-shift window.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wide text-muted">
            Wake time
          </span>
          <input
            type="time"
            value={wake}
            onChange={(e) => {
              const next = e.target.value;
              if (next && next !== wake) void persist({ wakeTime: next });
            }}
            disabled={saving}
            className="mt-1 h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wide text-muted">
            Bed time
          </span>
          <input
            type="time"
            value={bed}
            onChange={(e) => {
              const next = e.target.value;
              if (next && next !== bed) void persist({ bedTime: next });
            }}
            disabled={saving}
            className="mt-1 h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
          />
        </label>
      </div>
      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
