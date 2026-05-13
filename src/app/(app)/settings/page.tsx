"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  onSnapshot,
  serverTimestamp,
  setDoc,
  type PartialWithFieldValue,
} from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { profilePath } from "@/lib/db/paths";
import type { Profile, Timezone, UnitSystem } from "@/lib/db/types";

import TargetInput from "@/components/settings/TargetInput";
import TimezoneSelect, {
  detectTimezone,
} from "@/components/settings/TimezoneSelect";
import UnitToggle from "@/components/settings/UnitToggle";

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVED_INDICATOR_MS = 1500;

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // Debounce timer for clearing the "Saved" indicator.
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Subscribe to the user's profile doc.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.uid) return;
    const ref = profilePath(user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        if (data) {
          setProfile(data);
          setLoadError(null);
        } else {
          // Profile doc should exist after first-run seed (fn-3-167.3). If it
          // is missing we surface the error rather than auto-creating, since
          // the seed flow owns initial defaults.
          setLoadError(
            "Profile not found. Sign out and back in to re-run setup.",
          );
        }
      },
      (err) => {
        setLoadError(err.message);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  // Clean up any pending "Saved" timer on unmount.
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Persist a partial profile update.
  // ---------------------------------------------------------------------------
  const persist = useCallback(
    async (patch: Partial<Profile>) => {
      if (!user?.uid) return;
      setSaveState("saving");
      setSaveError(null);
      try {
        // Use setDoc with merge:true so we can pass a partial payload while
        // still going through the typed converter. `serverTimestamp()` is a
        // FieldValue sentinel that Firestore resolves on write — the converter
        // types `updatedAt` as Timestamp, and `PartialWithFieldValue<T>` is the
        // SDK's escape hatch for exactly this case.
        const payload: PartialWithFieldValue<Profile> = {
          ...patch,
          updatedAt: serverTimestamp(),
        };
        await setDoc(profilePath(user.uid), payload, { merge: true });

        setSaveState("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => {
          setSaveState((s) => (s === "saved" ? "idle" : s));
        }, SAVED_INDICATOR_MS);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to save settings.";
        setSaveState("error");
        setSaveError(message);
      }
    },
    [user?.uid],
  );

  // ---------------------------------------------------------------------------
  // Field handlers.
  // ---------------------------------------------------------------------------

  const handleUnitChange = useCallback(
    (next: UnitSystem) => {
      if (!profile || profile.unitSystem === next) return;
      void persist({ unitSystem: next });
    },
    [profile, persist],
  );

  const handleTimezoneChange = useCallback(
    (next: Timezone) => {
      if (!profile || profile.timezone === next) return;
      void persist({ timezone: next });
    },
    [profile, persist],
  );

  const handleProteinCommit = useCallback(
    (next: number) => {
      if (!profile || profile.proteinTargetG === next) return;
      void persist({ proteinTargetG: next });
    },
    [profile, persist],
  );

  const handleWeeklyGainCommit = useCallback(
    (next: number) => {
      if (!profile || profile.weeklyGainLb === next) return;
      void persist({ weeklyGainLb: next });
    },
    [profile, persist],
  );

  // ---------------------------------------------------------------------------
  // Sign-out (preserved from fn-2-6wx.3).
  // ---------------------------------------------------------------------------
  const handleSignOut = async () => {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sign out. Try again.";
      setSignOutError(message);
      setSigningOut(false);
    }
  };

  const detectedTz = profile ? null : detectTimezone();
  const disabled = !profile;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-100">Settings</h1>
        <SaveIndicator state={saveState} />
      </div>
      <p className="mt-2 text-sm text-muted">
        Display preferences and targets. Stored values stay canonical (kg / g) —
        switching units only changes how numbers are shown.
      </p>

      {loadError ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {loadError}
        </div>
      ) : null}

      {/* Preferences */}
      <div className="mt-6 space-y-5 rounded-xl border border-border bg-neutral-900/40 p-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">Units</h2>
          <p className="mt-1 text-xs text-muted">
            Display-only. Does not rewrite history.
          </p>
          <div className="mt-2">
            <UnitToggle
              value={profile?.unitSystem ?? "imperial"}
              onChange={handleUnitChange}
              disabled={disabled}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="settings-timezone"
            className="block text-sm font-medium text-neutral-200"
          >
            Timezone
          </label>
          <p className="mt-1 text-xs text-muted">
            Anchors which day a check-in counts toward.
            {detectedTz ? ` Detected: ${detectedTz}.` : null}
          </p>
          <div className="mt-2">
            <TimezoneSelect
              id="settings-timezone"
              value={profile?.timezone ?? detectTimezone()}
              onChange={handleTimezoneChange}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      {/* Targets */}
      <div className="mt-6 space-y-4 rounded-xl border border-border bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-200">Targets</h2>

        <TargetInput
          id="settings-protein-target"
          label="Daily protein"
          value={profile?.proteinTargetG ?? 0}
          onCommit={handleProteinCommit}
          unit="g / day"
          min={0}
          max={500}
          step={1}
          disabled={disabled}
        />

        <TargetInput
          id="settings-weekly-gain"
          label="Weekly bodyweight gain"
          value={profile?.weeklyGainLb ?? 0}
          onCommit={handleWeeklyGainCommit}
          unit="lb / week"
          min={-5}
          max={5}
          step={0.1}
          disabled={disabled}
        />
      </div>

      {saveError ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {saveError}
        </div>
      ) : null}

      {/* Account */}
      <div className="mt-6 space-y-3 rounded-xl border border-border bg-neutral-900/40 p-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">Account</h2>
          {user?.email ? (
            <p className="mt-1 text-xs text-muted break-all">{user.email}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-neutral-900 px-4 text-sm font-medium text-neutral-100 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>

        {signOutError ? (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            {signOutError}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const text =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Error";
  const color =
    state === "error"
      ? "text-red-300"
      : state === "saved"
        ? "text-emerald-300"
        : "text-muted";
  return (
    <span
      aria-live="polite"
      className={`text-xs font-medium ${color}`}
      data-state={state}
    >
      {text}
    </span>
  );
}
