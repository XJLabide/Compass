"use client";

import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { serverTimestamp, setDoc, type PartialWithFieldValue } from "firebase/firestore";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  Globe,
  Ruler,
  Target,
  User as UserIcon,
  Wallet,
} from "lucide-react";

import { useAuth } from "@/lib/auth/useAuth";
import { useUserData } from "@/lib/data/UserDataProvider";
import { profilePath } from "@/lib/db/paths";
import type {
  ExpenseCategory,
  Profile,
  UnitSystem,
} from "@/lib/db/types";
import {
  detectTimezone,
} from "@/components/settings/TimezoneSelect";

/**
 * Multi-step wizard shown when a user's profile is missing `onboarded: true`.
 *
 * Steps:
 *   1. Name + unit system
 *   2. Timezone
 *   3. Targets (protein g/day, weekly bodyweight gain lb/wk)
 *   4. Currency + optional monthly food budget (the most-edited category)
 *   5. Confirm — writes profile with `onboarded: true`
 *
 * The wizard renders as a full-screen overlay above the dashboard so the user
 * can't navigate around the unfilled prompt. We accept partial profiles as the
 * seed default, so this is additive, not blocking the data layer.
 */
type Step = 1 | 2 | 3 | 4 | 5;

interface WizardData {
  displayName: string;
  unitSystem: UnitSystem;
  timezone: string;
  proteinTargetG: number;
  weeklyGainLb: number;
  currency: string;
  foodBudgetMinor: number;
}

const COMMON_CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "CAD", "AUD",
  "PHP", "SGD", "HKD", "INR", "MXN", "BRL", "CHF",
];

export default function OnboardingWizard() {
  const { user } = useAuth();
  const { profile, profileLoaded } = useUserData();

  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
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
      proteinTargetG: profile?.proteinTargetG ?? 180,
      weeklyGainLb: profile?.weeklyGainLb ?? 0.5,
      currency: profile?.currency ?? "USD",
      foodBudgetMinor: profile?.budgets?.food ?? 0,
    }),
    [profile, user],
  );

  const [data, setData] = useState<WizardData>(initial);

  // Hide the wizard if the user has already onboarded OR if the profile snapshot
  // hasn't resolved yet (avoids a flash for returning users).
  if (!profileLoaded || !user) return null;
  if (profile?.onboarded === true) return null;

  const goto = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const finish = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.uid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload: PartialWithFieldValue<Profile> = {
        displayName: data.displayName.trim() || "Athlete",
        unitSystem: data.unitSystem,
        timezone: data.timezone,
        proteinTargetG: data.proteinTargetG,
        weeklyGainLb: data.weeklyGainLb,
        currency: data.currency,
        budgets:
          data.foodBudgetMinor > 0
            ? { food: data.foodBudgetMinor }
            : {},
        onboarded: true,
        updatedAt: serverTimestamp(),
      };
      await setDoc(profilePath(user.uid), payload, { merge: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-panel p-6 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-100">
              Welcome to Compass
            </h2>
            <p className="text-xs text-muted">
              Step {step} of 5 · ~30 seconds
            </p>
          </div>
        </header>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>

        <form onSubmit={finish} className="mt-5 space-y-4">
          {step === 1 ? (
            <StepName
              data={data}
              onChange={(patch) => setData((d) => ({ ...d, ...patch }))}
            />
          ) : null}
          {step === 2 ? (
            <StepTimezone
              data={data}
              onChange={(patch) => setData((d) => ({ ...d, ...patch }))}
            />
          ) : null}
          {step === 3 ? (
            <StepTargets
              data={data}
              onChange={(patch) => setData((d) => ({ ...d, ...patch }))}
            />
          ) : null}
          {step === 4 ? (
            <StepMoney
              data={data}
              onChange={(patch) => setData((d) => ({ ...d, ...patch }))}
            />
          ) : null}
          {step === 5 ? <StepConfirm data={data} /> : null}

          {error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
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
            {step < 5 ? (
              <button
                type="button"
                onClick={() => goto((step + 1) as Step)}
                className="ml-auto inline-flex h-10 items-center justify-center gap-1 rounded-md bg-accent px-4 text-xs font-semibold text-neutral-900 hover:brightness-110"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
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

function StepName({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  return (
    <>
      <SectionHeading icon={UserIcon} title="Who are you?" />
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-muted">
          Display name
        </span>
        <input
          type="text"
          value={data.displayName}
          onChange={(e) => onChange({ displayName: e.target.value })}
          placeholder="What should we call you?"
          autoFocus
          className="mt-1 h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
        />
      </label>

      <SectionHeading icon={Ruler} title="Units" />
      <div className="grid grid-cols-2 gap-2">
        {(["imperial", "metric"] as UnitSystem[]).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onChange({ unitSystem: u })}
            className={
              data.unitSystem === u
                ? "h-11 rounded-md bg-accent/20 text-sm font-medium text-accent"
                : "h-11 rounded-md border border-border bg-neutral-900 text-sm text-muted hover:text-neutral-200"
            }
          >
            {u === "imperial" ? "Imperial (lb / in)" : "Metric (kg / cm)"}
          </button>
        ))}
      </div>
    </>
  );
}

function StepTimezone({
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
        Anchors which day a check-in counts toward. We detected{" "}
        <span className="text-neutral-200">{detected}</span>.
      </p>
      <input
        type="text"
        value={data.timezone}
        onChange={(e) => onChange({ timezone: e.target.value })}
        placeholder="America/New_York"
        className="h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange({ timezone: detected })}
        className="text-xs font-medium text-accent hover:underline"
      >
        Use detected ({detected})
      </button>
    </>
  );
}

function StepTargets({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  return (
    <>
      <SectionHeading icon={Target} title="Daily protein" />
      <NumberRow
        value={data.proteinTargetG}
        onChange={(v) => onChange({ proteinTargetG: v })}
        suffix="g / day"
        step={5}
        min={0}
        max={500}
      />

      <SectionHeading icon={Target} title="Weekly bodyweight gain" />
      <NumberRow
        value={data.weeklyGainLb}
        onChange={(v) => onChange({ weeklyGainLb: v })}
        suffix="lb / week"
        step={0.1}
        min={-5}
        max={5}
      />
      <p className="text-[11px] text-muted">
        Set 0 for maintenance. Negative for cut. Most lean bulks are +0.3 to +0.7.
      </p>
    </>
  );
}

function StepMoney({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  const foodBudgetMajor = data.foodBudgetMinor / 100;
  return (
    <>
      <SectionHeading icon={Wallet} title="Currency" />
      <select
        value={data.currency}
        onChange={(e) => onChange({ currency: e.target.value })}
        className="h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
      >
        {COMMON_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <SectionHeading icon={Target} title="Monthly food budget (optional)" />
      <p className="text-[11px] text-muted">
        Set a cap and the dashboard will warn you as you approach it. Leave at 0 to skip.
      </p>
      <NumberRow
        value={foodBudgetMajor}
        onChange={(v) =>
          onChange({ foodBudgetMinor: Math.round(v * 100) })
        }
        suffix={`${data.currency} / month`}
        step={10}
        min={0}
        max={100000}
      />
    </>
  );
}

function StepConfirm({ data }: { data: WizardData }) {
  return (
    <>
      <SectionHeading icon={CheckCircle2} title="All set" />
      <ul className="space-y-2 rounded-md border border-border bg-neutral-900/60 p-3 text-xs">
        <li className="flex justify-between gap-3">
          <span className="text-muted">Name</span>
          <span className="text-neutral-100">
            {data.displayName || "Athlete"}
          </span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="text-muted">Units</span>
          <span className="text-neutral-100">
            {data.unitSystem === "imperial" ? "Imperial" : "Metric"}
          </span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="text-muted">Timezone</span>
          <span className="text-neutral-100">{data.timezone}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="text-muted">Protein</span>
          <span className="text-neutral-100">{data.proteinTargetG} g/day</span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="text-muted">Weekly weight</span>
          <span className="text-neutral-100">
            {data.weeklyGainLb >= 0 ? "+" : ""}
            {data.weeklyGainLb} lb/wk
          </span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="text-muted">Currency</span>
          <span className="text-neutral-100">{data.currency}</span>
        </li>
        {data.foodBudgetMinor > 0 ? (
          <li className="flex justify-between gap-3">
            <span className="text-muted">Food budget</span>
            <span className="text-neutral-100">
              {(data.foodBudgetMinor / 100).toFixed(0)} {data.currency}/mo
            </span>
          </li>
        ) : null}
      </ul>
      <p className="text-[11px] text-muted">
        You can change all of these later in Settings.
      </p>
    </>
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

function NumberRow({
  value,
  onChange,
  suffix,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))}
        className="h-11 w-11 shrink-0 rounded-md border border-border bg-neutral-900 text-lg text-neutral-200 hover:bg-neutral-800"
      >
        −
      </button>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full rounded-md border border-border bg-neutral-900 text-center text-base text-neutral-100 tabular-nums focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, Math.round((value + step) * 100) / 100))}
        className="h-11 w-11 shrink-0 rounded-md border border-border bg-neutral-900 text-lg text-neutral-200 hover:bg-neutral-800"
      >
        +
      </button>
      <span className="w-24 shrink-0 text-right text-[11px] text-muted">
        {suffix}
      </span>
    </div>
  );
}
