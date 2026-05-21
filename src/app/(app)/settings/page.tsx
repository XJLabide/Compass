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

import {
  AlertTriangle,
  Bell,
  Clock,
  Globe,
  LogOut,
  Ruler,
  Tag,
  Target,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";

import InstallPrompt from "@/components/InstallPrompt";
import CustomCategoriesSection from "@/components/settings/CustomCategoriesSection";
import DangerZoneSection from "@/components/settings/DangerZoneSection";
import DayWindowSection from "@/components/settings/DayWindowSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
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
  const [profileLoaded, setProfileLoaded] = useState(false);
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
        setProfile(data ?? null);
        setProfileLoaded(true);
        setLoadError(null);
      },
      (err) => {
        setLoadError(err.message);
        setProfileLoaded(true);
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
      if (profile?.unitSystem === next) return;
      void persist({ unitSystem: next });
    },
    [profile, persist],
  );

  const handleTimezoneChange = useCallback(
    (next: Timezone) => {
      if (profile?.timezone === next) return;
      void persist({ timezone: next });
    },
    [profile, persist],
  );

  const handleProteinCommit = useCallback(
    (next: number) => {
      if (profile?.proteinTargetG === next) return;
      void persist({ proteinTargetG: next });
    },
    [profile, persist],
  );

  const handleWeeklyGainCommit = useCallback(
    (next: number) => {
      if (profile?.weeklyGainLb === next) return;
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
  // Disable inputs only while we haven't yet heard back from the snapshot.
  // After loading, even a missing profile doc renders the form with sensible
  // defaults so the user can configure their preferences.
  const disabled = !profileLoaded;

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          Settings
        </h1>
        <SaveIndicator state={saveState} />
      </div>

      {loadError ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {loadError}
        </div>
      ) : null}

      {/* Preferences */}
      <SettingsGroup
        icon={Ruler}
        title="Units"
        subtitle="Display-only. Stored values are always canonical (kg / g)."
      >
        <UnitToggle
          value={profile?.unitSystem ?? "imperial"}
          onChange={handleUnitChange}
          disabled={disabled}
        />
      </SettingsGroup>

      <SettingsGroup
        icon={Globe}
        title="Timezone"
        subtitle={`Anchors which day a check-in counts toward.${detectedTz ? ` Detected: ${detectedTz}.` : ""}`}
      >
        <TimezoneSelect
          id="settings-timezone"
          value={profile?.timezone ?? detectTimezone()}
          onChange={handleTimezoneChange}
          disabled={disabled}
        />
      </SettingsGroup>

      {/* Targets */}
      <SettingsGroup
        icon={Target}
        title="Targets"
        subtitle="Numbers your dashboard widgets compare against."
      >
        <div className="space-y-4">
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
      </SettingsGroup>

      {saveError ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {saveError}
        </div>
      ) : null}

      {/* Day window */}
      <SettingsGroup
        icon={Clock}
        title="Day window"
        subtitle="Wake and bed times drive Today's awake-progress bar."
      >
        <DayWindowSection />
      </SettingsGroup>

      {/* Expense categories */}
      <SettingsGroup
        icon={Tag}
        title="Expense categories"
        subtitle="Add your own categories to use in the Money tracker."
      >
        <CustomCategoriesSection />
      </SettingsGroup>

      {/* Notifications */}
      <SettingsGroup
        icon={Bell}
        title="Notifications"
        subtitle="Daily nudge if you haven't logged anything yet."
      >
        <NotificationsSection />
      </SettingsGroup>

      <InstallPrompt />

      {/* Account */}
      <SettingsGroup icon={UserIcon} title="Account" subtitle={user?.email ?? ""}>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-neutral-900 px-4 text-sm font-medium text-neutral-100 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut aria-hidden className="h-4 w-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>

        {signOutError ? (
          <div
            role="alert"
            aria-live="polite"
            className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            {signOutError}
          </div>
        ) : null}
      </SettingsGroup>

      <SettingsGroup
        icon={AlertTriangle}
        title="Danger zone"
        subtitle="Irreversible actions. Read carefully."
      >
        <DangerZoneSection />
      </SettingsGroup>
    </section>
  );
}

function SettingsGroup({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
          <Icon aria-hidden className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
          {subtitle ? (
            <p className="text-[11px] text-muted break-all">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
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
