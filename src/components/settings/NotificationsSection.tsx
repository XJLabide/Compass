"use client";

import { useCallback, useState } from "react";
import { serverTimestamp, setDoc } from "firebase/firestore";
import { Bell, BellOff } from "lucide-react";

import { useUserData } from "@/lib/data/UserDataProvider";
import { profilePath } from "@/lib/db/paths";
import { useNotificationPermission } from "@/components/NotificationsManager";

/**
 * Settings panel section for daily reminder notifications. Handles:
 *   - Permission prompt
 *   - Toggle on/off (stored in profile.notificationsEnabled)
 *   - Reminder time picker (stored in profile.reminderTime "HH:MM")
 */
export default function NotificationsSection() {
  const { uid, profile } = useUserData();
  const { permission, request } = useNotificationPermission();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = profile?.notificationsEnabled === true;
  const reminderTime = profile?.reminderTime ?? "21:00";

  const persist = useCallback(
    async (patch: { notificationsEnabled?: boolean; reminderTime?: string }) => {
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

  const handleToggle = async () => {
    if (!enabled) {
      const perm = await request();
      if (perm !== "granted") {
        if (perm === "unsupported") {
          setError("This browser doesn't support notifications.");
        } else if (perm === "denied") {
          setError(
            "Notifications are blocked in your browser settings. Enable them there first.",
          );
        }
        return;
      }
      await persist({ notificationsEnabled: true });
    } else {
      await persist({ notificationsEnabled: false });
    }
  };

  const handleTimeChange = (next: string) => {
    if (next === reminderTime) return;
    void persist({ reminderTime: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-100">
            Daily reminder
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            Fires once at your chosen time if you haven&apos;t logged anything
            yet. Only works while a Compass tab is open.
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={saving}
          aria-pressed={enabled}
          className={
            enabled
              ? "inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-medium text-neutral-900 hover:brightness-110"
              : "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
          }
        >
          {enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          {enabled ? "On" : "Off"}
        </button>
      </div>

      {enabled ? (
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wide text-muted">
            Time
          </span>
          <input
            type="time"
            value={reminderTime}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
          />
        </label>
      ) : null}

      {permission === "denied" ? (
        <p className="text-[11px] text-amber-300">
          Notifications are blocked at the browser level. Unblock them in your
          browser settings to re-enable.
        </p>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
