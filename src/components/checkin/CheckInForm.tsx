"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  onSnapshot,
  serverTimestamp,
  setDoc,
  type PartialWithFieldValue,
} from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { dailyPath } from "@/lib/db/paths";
import type { DailyDoc, Profile } from "@/lib/db/types";
import {
  displayToKg,
  kgToDisplay,
  roundDisplayWeight,
  weightUnitLabel,
} from "@/lib/workout/units";
import { computeLocalDate } from "@/lib/workout/scheduling";

import RatingChip from "./RatingChip";
import DatePicker, {
  backfillMinDate,
  isWithinBackfillWindow,
} from "./DatePicker";

/**
 * Daily check-in form.
 *
 * Renders all PRD §5.3 fields on one screen with a sticky submit footer that
 * sits above the bottom tab bar and respects the iOS safe-area inset.
 *
 * Data model:
 *   - One Firestore doc per `YYYY-MM-DD`, computed in the profile's IANA tz.
 *   - Writes go through `setDoc({merge:true})` so any subset of fields can be
 *     saved without clobbering prior entries for the same day.
 *   - Display uses `profile.unitSystem`; storage is canonical (kg / g / ml).
 *
 * State strategy: each input is held as a string so an empty field round-trips
 * cleanly (no `0` ghosts). On submit, strings are parsed; any field that's
 * blank or unparsable is OMITTED from the payload (so it isn't overwritten
 * with `undefined` and doesn't fail rule validators).
 */

export interface CheckInFormProps {
  profile: Profile;
  /**
   * Override the active `localDate`. When set (and within the 7-day backfill
   * window), the form operates on that day's doc instead of "today". The
   * parent passes a callback so the picker can change the URL `?date=` param.
   */
  initialLocalDate?: string;
  /**
   * Called when the user picks a different date in the backfill picker. The
   * parent is expected to update the URL (router.replace) so the selection
   * survives reload and back/forward.
   */
  onDateChange?: (next: string) => void;
}

type FormState = {
  bodyweight: string;
  sleepHours: string;
  sleepQuality: number | undefined;
  calories: string;
  protein: string;
  water: string;
  steps: string;
  mood: number | undefined;
  note: string;
};

const EMPTY_STATE: FormState = {
  bodyweight: "",
  sleepHours: "",
  sleepQuality: undefined,
  calories: "",
  protein: "",
  water: "",
  steps: "",
  mood: undefined,
  note: "",
};

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVED_INDICATOR_MS = 2000;

function parseNumber(input: string): number | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseInt10(input: string): number | undefined {
  const n = parseNumber(input);
  if (n === undefined) return undefined;
  // Steps & calories are stored as integers; round once on submit.
  return Math.round(n);
}

function formatNumber(n: number | undefined, fractionDigits: number): string {
  if (n === undefined || !Number.isFinite(n)) return "";
  // Strip trailing zeros after rounding to keep inputs tidy.
  return Number(n.toFixed(fractionDigits)).toString();
}

/**
 * Format a Firestore `Timestamp` as a friendly "Saved {time ago}" string.
 * Falls back to an absolute time for anything older than a day.
 */
function formatSavedAt(updatedAt: DailyDoc["updatedAt"] | undefined): string | null {
  if (!updatedAt) return null;
  const date =
    typeof (updatedAt as { toDate?: () => Date }).toDate === "function"
      ? (updatedAt as unknown as { toDate: () => Date }).toDate()
      : null;
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return date.toLocaleDateString();
}

export default function CheckInForm({
  profile,
  initialLocalDate,
  onDateChange,
}: CheckInFormProps) {
  const { user } = useAuth();

  // ---- Local date anchor -----------------------------------------------------
  // `today` is the timezone-aware "now" anchor used as the upper bound of the
  // backfill window. It's cheap to recompute on every render (one Intl call)
  // and ensures a user who leaves the page open across midnight rolls over on
  // the next interaction.
  const today = useMemo(
    () => computeLocalDate(new Date(), profile.timezone),
    [profile.timezone],
  );
  const minBackfill = useMemo(() => backfillMinDate(today), [today]);

  // Resolve the *active* localDate. We honor `initialLocalDate` only when it
  // sits inside the 7-day backfill window; anything else silently falls back
  // to today (the parent page is responsible for surfacing the "use History"
  // message before it gets here, but we double-guard here to avoid writing to
  // an out-of-window doc if a stale URL is hit).
  const localDate = useMemo(() => {
    if (
      initialLocalDate &&
      isWithinBackfillWindow(initialLocalDate, today, minBackfill)
    ) {
      return initialLocalDate;
    }
    return today;
  }, [initialLocalDate, today, minBackfill]);

  // ---- Form state -----------------------------------------------------------
  const [state, setState] = useState<FormState>(EMPTY_STATE);
  // Whether we've hydrated the form from an existing doc yet. We delay
  // rendering inputs as "dirty" until after the first snapshot resolves so
  // typed-then-snapshot races don't clobber user input.
  const hydratedRef = useRef(false);

  const [existing, setExisting] = useState<DailyDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Subscribe to today's doc ---------------------------------------------
  useEffect(() => {
    if (!user?.uid) return;
    const ref = dailyPath(user.uid, localDate);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() ?? null) : null;
        setExisting(data);
        setLoadError(null);

        // Hydrate inputs once on first snapshot. Subsequent snapshots reflect
        // our own writes (or another tab's) and we surface them via the
        // "Saved {ago}" indicator without overwriting the user's in-progress
        // typing.
        if (!hydratedRef.current) {
          hydratedRef.current = true;
          if (data) {
            setState({
              bodyweight:
                data.bodyweightKg !== undefined
                  ? formatNumber(
                      roundDisplayWeight(
                        kgToDisplay(data.bodyweightKg, profile.unitSystem),
                      ),
                      1,
                    )
                  : "",
              sleepHours: formatNumber(data.sleepHours, 1),
              sleepQuality: data.sleepQuality,
              calories: formatNumber(data.calories, 0),
              protein: formatNumber(data.proteinG, 0),
              water: formatNumber(data.waterMl, 0),
              steps: formatNumber(data.steps, 0),
              mood: data.mood,
              note: data.note ?? "",
            });
          }
        }
      },
      (err) => {
        setLoadError(err.message);
      },
    );
    return () => unsub();
  }, [user?.uid, localDate, profile.unitSystem]);

  // Reset the hydration latch if the day rolls over while the form is mounted.
  useEffect(() => {
    hydratedRef.current = false;
    setState(EMPTY_STATE);
  }, [localDate]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // ---- Handlers --------------------------------------------------------------
  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleText = useCallback(
    (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setField(key, e.target.value as FormState[typeof key]);
    },
    [setField],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!user?.uid) return;

      setSaveState("saving");
      setSaveError(null);

      // Build a payload that contains only fields the user actually filled in,
      // so `setDoc({merge:true})` can't blow away prior values with undefined.
      const payload: PartialWithFieldValue<DailyDoc> = {
        localDate,
        updatedAt: serverTimestamp(),
      };

      const bw = parseNumber(state.bodyweight);
      if (bw !== undefined) {
        payload.bodyweightKg = displayToKg(bw, profile.unitSystem);
      }
      const sleep = parseNumber(state.sleepHours);
      if (sleep !== undefined) payload.sleepHours = sleep;
      if (state.sleepQuality !== undefined) {
        payload.sleepQuality = state.sleepQuality;
      }
      const calories = parseInt10(state.calories);
      if (calories !== undefined) payload.calories = calories;
      const protein = parseNumber(state.protein);
      if (protein !== undefined) payload.proteinG = protein;
      // Water input is in display units (oz for imperial, ml for metric).
      const water = parseNumber(state.water);
      if (water !== undefined) {
        payload.waterMl =
          profile.unitSystem === "imperial"
            ? Math.round(water * 29.5735) // fl oz → ml (US customary)
            : Math.round(water);
      }
      const steps = parseInt10(state.steps);
      if (steps !== undefined) payload.steps = steps;
      if (state.mood !== undefined) payload.mood = state.mood;
      const note = state.note.trim();
      if (note) payload.note = note;

      try {
        await setDoc(dailyPath(user.uid, localDate), payload, { merge: true });
        setSaveState("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => {
          setSaveState((s) => (s === "saved" ? "idle" : s));
        }, SAVED_INDICATOR_MS);
      } catch (err) {
        setSaveState("error");
        setSaveError(err instanceof Error ? err.message : "Failed to save.");
      }
    },
    [
      user?.uid,
      localDate,
      profile.unitSystem,
      state.bodyweight,
      state.sleepHours,
      state.sleepQuality,
      state.calories,
      state.protein,
      state.water,
      state.steps,
      state.mood,
      state.note,
    ],
  );

  // ---- Derived display labels -----------------------------------------------
  const weightLabel = weightUnitLabel(profile.unitSystem);
  const waterUnitLabel = profile.unitSystem === "imperial" ? "fl oz" : "ml";
  const savedAgo = formatSavedAt(existing?.updatedAt);

  // Pre-fill placeholders from profile targets.
  const proteinPlaceholder = profile.proteinTargetG
    ? `target ${profile.proteinTargetG} g`
    : "g";
  // No persisted calorie target in v1, so just show the unit hint.
  const caloriesPlaceholder = "kcal";

  return (
    <form onSubmit={handleSubmit} className="pb-32" noValidate>
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Check-in</h1>
          <p className="mt-1 text-xs text-muted">
            {localDate === today ? "Today" : "Backfill"} · {localDate}
          </p>
        </div>
        {savedAgo ? (
          <span aria-live="polite" className="text-xs text-muted">
            Saved {savedAgo}
          </span>
        ) : null}
      </header>

      {loadError ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {loadError}
        </div>
      ) : null}

      <div className="mt-5 rounded-xl border border-border bg-neutral-900/40 p-4">
        <DatePicker
          value={localDate}
          today={today}
          min={minBackfill}
          onPick={(next) => {
            // Hand off URL changes to the parent — the snapshot effect keyed
            // on `localDate` will rehydrate the form for the new day.
            hydratedRef.current = false;
            onDateChange?.(next);
          }}
        />
      </div>

      <div className="mt-4 space-y-5 rounded-xl border border-border bg-neutral-900/40 p-4">
        {/* Bodyweight */}
        <NumericField
          id="checkin-bodyweight"
          label="Bodyweight"
          unit={weightLabel}
          value={state.bodyweight}
          onChange={handleText("bodyweight")}
          step="0.1"
          placeholder={weightLabel}
        />

        {/* Sleep hours + quality side by side */}
        <div className="grid grid-cols-2 gap-3">
          <NumericField
            id="checkin-sleep-hours"
            label="Sleep"
            unit="hours"
            value={state.sleepHours}
            onChange={handleText("sleepHours")}
            step="0.25"
            placeholder="hrs"
          />
          <RatingChip
            id="checkin-sleep-quality"
            label="Sleep quality"
            value={state.sleepQuality}
            onChange={(v) => setField("sleepQuality", v)}
          />
        </div>

        {/* Calories + Protein */}
        <div className="grid grid-cols-2 gap-3">
          <NumericField
            id="checkin-calories"
            label="Calories"
            unit="kcal"
            value={state.calories}
            onChange={handleText("calories")}
            step="1"
            placeholder={caloriesPlaceholder}
          />
          <NumericField
            id="checkin-protein"
            label="Protein"
            unit="g"
            value={state.protein}
            onChange={handleText("protein")}
            step="1"
            placeholder={proteinPlaceholder}
          />
        </div>

        {/* Water + Steps */}
        <div className="grid grid-cols-2 gap-3">
          <NumericField
            id="checkin-water"
            label="Water"
            unit={waterUnitLabel}
            value={state.water}
            onChange={handleText("water")}
            step="1"
            placeholder={waterUnitLabel}
          />
          <NumericField
            id="checkin-steps"
            label="Steps"
            unit=""
            value={state.steps}
            onChange={handleText("steps")}
            step="1"
            placeholder="steps"
          />
        </div>

        {/* Mood */}
        <RatingChip
          id="checkin-mood"
          label="Mood"
          value={state.mood}
          onChange={(v) => setField("mood", v)}
        />

        {/* Note */}
        <div>
          <label
            htmlFor="checkin-note"
            className="block text-sm font-medium text-neutral-200"
          >
            Note
          </label>
          <textarea
            id="checkin-note"
            value={state.note}
            onChange={handleText("note")}
            rows={2}
            className="mt-2 block w-full rounded-lg border border-border bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder="How did today feel?"
          />
        </div>
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

      {/* Sticky submit footer.
          Lives above the 64px tab bar (h-14) plus the device safe-area inset
          so it clears the iOS home indicator regardless of orientation. */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-md px-4 pt-3"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 56px)",
        }}
      >
        <div className="rounded-xl border border-border bg-panel/95 p-3 shadow-lg backdrop-blur">
          <button
            type="submit"
            disabled={saveState === "saving"}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-neutral-950 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : existing
                  ? "Update check-in"
                  : "Save check-in"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Local UI helpers
// ---------------------------------------------------------------------------

interface NumericFieldProps {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  step?: string;
  placeholder?: string;
}

function NumericField({
  id,
  label,
  unit,
  value,
  onChange,
  step = "any",
  placeholder,
}: NumericFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between text-sm font-medium text-neutral-200"
      >
        <span>{label}</span>
        {unit ? <span className="text-xs text-muted">{unit}</span> : null}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        step={step}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-2 block h-11 w-full rounded-lg border border-border bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
      />
    </div>
  );
}
