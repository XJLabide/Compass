"use client";

import { useMemo, useState, type FormEvent } from "react";
import { serverTimestamp, setDoc, type PartialWithFieldValue } from "firebase/firestore";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  Globe,
  Ruler,
  User as UserIcon,
  Wallet,
} from "lucide-react";

import { useAuth } from "@/lib/auth/useAuth";
import { useUserData } from "@/lib/data/UserDataProvider";
import { profilePath } from "@/lib/db/paths";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import type { Profile, UnitSystem } from "@/lib/db/types";
import { detectTimezone } from "@/components/settings/TimezoneSelect";
import { REPORTING_CURRENCY_OPTIONS } from "@/lib/money/currency";

type Step = 1 | 2 | 3;

interface WizardData {
  displayName: string;
  unitSystem: UnitSystem;
  timezone: string;
  currency: string;
}

export default function OnboardingWizard() {
  const { user } = useAuth();
  const { profile, profileLoaded } = useUserData();

  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = useMemo<WizardData>(
    () => ({
      displayName:
        profile?.displayName?.trim() ||
        user?.displayName ||
        user?.email?.split("@")[0] ||
        "",
      unitSystem: profile?.unitSystem ?? "imperial",
      timezone: profile?.timezone || detectTimezone(),
      currency: profile?.currency ?? "PHP",
    }),
    [profile, user],
  );
  const [data, setData] = useState<WizardData>(initial);

  const onboarded =
    completed || (profile?.onboarded === true && !saving && !error);
  const shouldShow = profileLoaded && Boolean(user) && !onboarded;
  useBodyScrollLock(shouldShow);
  // Wait for first-run seeding to create the full profile before allowing the
  // owner to complete onboarding. Otherwise a partial merge could win the race.
  if (!profileLoaded || !user || !profile || onboarded) return null;

  const update = (patch: Partial<WizardData>) =>
    setData((current) => ({ ...current, ...patch }));

  const goto = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const finish = async (event: FormEvent) => {
    event.preventDefault();
    if (!user.uid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload: PartialWithFieldValue<Profile> = {
        displayName: data.displayName.trim() || user.displayName?.trim() || "Athlete",
        unitSystem: data.unitSystem,
        timezone: data.timezone,
        currency: data.currency,
        onboarded: true,
        updatedAt: serverTimestamp(),
      };
      await setDoc(profilePath(user.uid), payload, { merge: true });
      setCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-panel p-6 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-100">
              Welcome to Compass
            </h2>
            <p className="text-xs text-muted">Step {step} of 3 · about 20 seconds</p>
          </div>
        </header>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <form onSubmit={finish} className="mt-5 space-y-4">
          {step === 1 ? <StepProfile data={data} onChange={update} /> : null}
          {step === 2 ? <StepPreferences data={data} onChange={update} /> : null}
          {step === 3 ? <StepConfirm data={data} /> : null}

          {error ? (
            <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-2 pt-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => goto((step - 1) as Step)}
                className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 hover:bg-neutral-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            ) : null}
            {step < 3 ? (
              <button
                key="next"
                type="button"
                onClick={() => goto((step + 1) as Step)}
                className="ml-auto inline-flex h-10 items-center justify-center gap-1 rounded-md bg-accent px-4 text-xs font-semibold text-neutral-900 hover:brightness-110"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                key="finish"
                type="submit"
                disabled={saving}
                className="ml-auto inline-flex h-10 items-center justify-center gap-1 rounded-md bg-accent px-4 text-xs font-semibold text-neutral-900 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Finish setup"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function StepProfile({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  return (
    <>
      <SectionHeading icon={UserIcon} title="Your profile" />
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-muted">Display name</span>
        <input
          type="text"
          value={data.displayName}
          onChange={(event) => onChange({ displayName: event.target.value })}
          placeholder="What should we call you?"
          autoFocus
          className="mt-1 h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
        />
      </label>

      <SectionHeading icon={Ruler} title="Display units" />
      <div className="grid grid-cols-2 gap-2">
        {(["imperial", "metric"] as UnitSystem[]).map((unitSystem) => (
          <button
            key={unitSystem}
            type="button"
            aria-pressed={data.unitSystem === unitSystem}
            onClick={() => onChange({ unitSystem })}
            className={
              data.unitSystem === unitSystem
                ? "h-11 rounded-md bg-accent/20 text-sm font-medium text-accent"
                : "h-11 rounded-md border border-border bg-neutral-900 text-sm text-muted hover:text-neutral-200"
            }
          >
            {unitSystem === "imperial" ? "Imperial (lb / in)" : "Metric (kg / cm)"}
          </button>
        ))}
      </div>
    </>
  );
}

function StepPreferences({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  const detected = detectTimezone();
  return (
    <>
      <SectionHeading icon={Globe} title="Timezone" />
      <p className="text-xs text-muted">
        This determines which day your logs belong to. We detected{" "}
        <span className="text-neutral-200">{detected}</span>.
      </p>
      <label className="block">
        <span className="sr-only">Timezone</span>
        <input
          type="text"
          value={data.timezone}
          onChange={(event) => onChange({ timezone: event.target.value })}
          placeholder="America/Manila"
          className="h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
        />
      </label>
      <button
        type="button"
        onClick={() => onChange({ timezone: detected })}
        className="text-xs font-medium text-accent hover:underline"
      >
        Use detected ({detected})
      </button>

      <SectionHeading icon={Wallet} title="Reporting currency" />
      <label className="block">
        <span className="sr-only">Reporting currency</span>
        <select
          value={data.currency}
          onChange={(event) => onChange({ currency: event.target.value })}
          className="h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
        >
          {REPORTING_CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function StepConfirm({ data }: { data: WizardData }) {
  return (
    <>
      <SectionHeading icon={CheckCircle2} title="Ready for your first day" />
      <ul className="space-y-2 rounded-md border border-border bg-neutral-900/60 p-3 text-xs">
        <SummaryRow label="Name" value={data.displayName || "Athlete"} />
        <SummaryRow
          label="Units"
          value={data.unitSystem === "imperial" ? "Imperial" : "Metric"}
        />
        <SummaryRow label="Timezone" value={data.timezone} />
        <SummaryRow label="Reporting currency" value={data.currency} />
      </ul>
      <p className="text-[11px] text-muted">
        Nutrition targets and wake/bed times are optional. You can set them later in Settings.
      </p>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-neutral-100">{value}</span>
    </li>
  );
}

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <Icon className="h-4 w-4 text-accent" />
      <span className="text-sm font-medium text-neutral-100">{title}</span>
    </div>
  );
}
