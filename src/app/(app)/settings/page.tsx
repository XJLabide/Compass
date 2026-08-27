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
  Brush,
  Bell,
  CalendarDays,
  Clock,
  CreditCard,
  Globe,
  LogOut,
  Ruler,
  Tag,
  Target,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";

import { AppearanceSection } from "@/components/settings/AppearanceRuntime";
import InstallPrompt from "@/components/InstallPrompt";
import CustomCategoriesSection from "@/components/settings/CustomCategoriesSection";
import DangerZoneSection from "@/components/settings/DangerZoneSection";
import DayWindowSection from "@/components/settings/DayWindowSection";
import GoogleCalendarIntegrationSection from "@/components/settings/GoogleCalendarIntegrationSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import RecurringFeesSection from "@/components/money/RecurringFeesSection";
import TargetInput from "@/components/settings/TargetInput";
import TimezoneSelect, {
  detectTimezone,
} from "@/components/settings/TimezoneSelect";
import UnitToggle from "@/components/settings/UnitToggle";
import { computeLocalDate } from "@/lib/workout/scheduling";

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

  const handleCalorieCommit = useCallback(
    (next: number) => {
      if (profile?.calorieTargetKcal === next) return;
      void persist({ calorieTargetKcal: next });
    },
    [profile, persist],
  );

  const handleCarbCommit = useCallback(
    (next: number) => {
      if (profile?.carbTargetG === next) return;
      void persist({ carbTargetG: next });
    },
    [profile, persist],
  );

  const handleFatCommit = useCallback(
    (next: number) => {
      if (profile?.fatTargetG === next) return;
      void persist({ fatTargetG: next });
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
  const settingsTz = profile?.timezone ?? detectedTz ?? "UTC";
  const today = computeLocalDate(new Date(), settingsTz);
  const currency = profile?.currency ?? "PHP";
  // Disable inputs only while we haven't yet heard back from the snapshot.
  // After loading, even a missing profile doc renders the form with sensible
  // defaults so the user can configure their preferences.
  const disabled = !profileLoaded;
  const configuredTargets = [
    profile?.calorieTargetKcal,
    profile?.proteinTargetG,
    profile?.carbTargetG,
    profile?.fatTargetG,
    profile?.weeklyGainLb,
  ].filter((value) => typeof value === "number" && value !== 0).length;
  const customCategoryCount = profile?.customCategories?.length ?? 0;
  const navItems = [
    { href: "#appearance", label: "Appearance" },
    { href: "#preferences", label: "Preferences" },
    { href: "#targets", label: "Targets" },
    { href: "#schedule", label: "Schedule" },
    { href: "#integrations", label: "Integrations" },
    { href: "#money", label: "Money" },
    { href: "#account", label: "Account" },
  ];

  return (
    <section className="mx-auto max-w-6xl space-y-6 pb-10">
      <header className="border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
              Settings
            </h1>
            <p className="mt-1 text-sm text-muted">
              Tune how Compass looks, counts your day, and tracks your money.
            </p>
          </div>
          <SaveIndicator state={saveState} />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatusTile label="Account" value={user?.email ?? "Signed in"} />
          <StatusTile label="Units" value={profile?.unitSystem ?? "imperial"} />
          <StatusTile label="Timezone" value={settingsTz} />
          <StatusTile label="Targets" value={`${configuredTargets}/5 set`} />
        </div>
      </header>

      {loadError ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {loadError}
        </div>
      ) : null}

      {saveError ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {saveError}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
        <nav
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto border-b border-border pb-2 lg:sticky lg:top-4 lg:block lg:overflow-visible lg:border-b-0 lg:pb-0"
        >
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block shrink-0 rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-neutral-900 hover:text-neutral-100 lg:w-full"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="space-y-4">
          <SettingsPanel
            id="appearance"
            icon={Brush}
            title="Appearance"
            subtitle="Local UI preferences for this device."
          >
            <AppearanceSection />
          </SettingsPanel>

          <SettingsPanel
            id="preferences"
            icon={Ruler}
            title="Preferences"
            subtitle="Display units and the timezone used for daily logs."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <SettingBlock
                icon={Ruler}
                title="Units"
                detail="Stored values stay canonical."
              >
                <UnitToggle
                  value={profile?.unitSystem ?? "imperial"}
                  onChange={handleUnitChange}
                  disabled={disabled}
                />
              </SettingBlock>
              <SettingBlock
                icon={Globe}
                title="Timezone"
                detail={detectedTz ? `Detected: ${detectedTz}` : undefined}
              >
                <TimezoneSelect
                  id="settings-timezone"
                  value={profile?.timezone ?? detectTimezone()}
                  onChange={handleTimezoneChange}
                  disabled={disabled}
                />
              </SettingBlock>
            </div>
          </SettingsPanel>

          <SettingsPanel
            id="targets"
            icon={Target}
            title="Targets"
            subtitle="Nutrition and bodyweight numbers used by dashboard widgets."
          >
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
              <TargetInput
                id="settings-calories-target"
                label="Daily calories"
                value={profile?.calorieTargetKcal ?? 0}
                onCommit={handleCalorieCommit}
                unit="kcal / day"
                min={0}
                max={20000}
                step={10}
                disabled={disabled}
              />

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
                id="settings-carbs-target"
                label="Daily carbohydrates"
                value={profile?.carbTargetG ?? 0}
                onCommit={handleCarbCommit}
                unit="g / day"
                min={0}
                max={1000}
                step={5}
                disabled={disabled}
              />

              <TargetInput
                id="settings-fat-target"
                label="Daily fat"
                value={profile?.fatTargetG ?? 0}
                onCommit={handleFatCommit}
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
          </SettingsPanel>

          <SettingsPanel
            id="schedule"
            icon={Clock}
            title="Schedule"
            subtitle="Wake window and daily reminder behavior."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <SettingBlock
                icon={Clock}
                title="Day window"
                detail="Drives Today's awake progress."
              >
                <DayWindowSection />
              </SettingBlock>
              <SettingBlock
                icon={Bell}
                title="Notifications"
                detail="Daily nudge when logging is quiet."
              >
                <NotificationsSection />
              </SettingBlock>
            </div>
          </SettingsPanel>

          <SettingsPanel
            id="integrations"
            icon={CalendarDays}
            title="Integrations"
            subtitle="External accounts that can import data into Compass."
          >
            <SettingBlock
              icon={CalendarDays}
              title="Calendar import"
              detail="Google events stay read-only in Compass."
            >
              <GoogleCalendarIntegrationSection />
            </SettingBlock>
          </SettingsPanel>

          <SettingsPanel
            id="money"
            icon={CreditCard}
            title="Money"
            subtitle={`${customCategoryCount} custom ${customCategoryCount === 1 ? "category" : "categories"} · recurring charges in ${currency}`}
          >
            <div className="space-y-5">
              <SettingBlock
                icon={Tag}
                title="Expense categories"
                detail="Extend the default money categories."
              >
                <CustomCategoriesSection />
              </SettingBlock>

              {user?.uid ? (
                <SettingBlock
                  icon={CreditCard}
                  title="Recurring fees"
                  detail="Subscriptions, rent, insurance, and predictable charges."
                >
                  <RecurringFeesSection
                    uid={user.uid}
                    profile={profile}
                    currency={currency}
                    today={today}
                    framed={false}
                  />
                </SettingBlock>
              ) : null}
            </div>
          </SettingsPanel>

          <SettingsPanel
            id="account"
            icon={UserIcon}
            title="Account"
            subtitle={user?.email ?? "Signed in"}
          >
            <div className="space-y-5">
              <InstallPrompt />

              <SettingBlock icon={UserIcon} title="Session">
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-neutral-950 px-4 text-sm font-medium text-neutral-100 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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
              </SettingBlock>

              <SettingBlock
                icon={AlertTriangle}
                title="Danger zone"
                detail="Irreversible account actions."
              >
                <DangerZoneSection />
              </SettingBlock>
            </div>
          </SettingsPanel>
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  id,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-5 rounded-lg border border-border bg-neutral-900/35"
    >
      <div className="grid gap-4 p-4 md:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="flex min-w-0 items-start gap-2">
          <Icon aria-hidden className="h-4 w-4" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-xs leading-5 text-muted">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

function SettingBlock({
  icon: Icon,
  title,
  detail,
  children,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-neutral-950 p-4">
      <div className="mb-3 flex items-start gap-2">
        <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
          {detail ? (
            <p className="mt-0.5 text-xs text-muted">{detail}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-neutral-900/50 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-neutral-100">
        {value}
      </div>
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
