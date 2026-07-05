"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";

import { useAuth } from "@/lib/auth/useAuth";
import { useUserData } from "@/lib/data/UserDataProvider";
import { dailyPath, profilePath } from "@/lib/db/paths";
import type { DailyDoc, FavoriteFood, LoggedMealItem, Profile } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";

import MealLogger from "@/components/checkin/MealLogger";
import DatePicker, {
  backfillMinDate,
  isWithinBackfillWindow,
} from "@/components/checkin/DatePicker";
import { detectTimezone } from "@/components/settings/TimezoneSelect";
import Skeleton from "@/components/ui/Skeleton";

const DATE_PARAM = "date";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function NutritionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { effectiveProfile, profileLoaded } = useUserData();

  const [dailyDoc, setDailyDoc] = useState<DailyDoc | null>(null);
  const [dailyLoaded, setDailyLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Parse + validate the date param ----
  const timezone = effectiveProfile?.timezone ?? "UTC";
  const today = useMemo(() => computeLocalDate(new Date(), timezone), [timezone]);
  const minBackfill = useMemo(() => backfillMinDate(today), [today]);

  const rawDateParam = searchParams.get(DATE_PARAM);
  const activeDate = useMemo(() => {
    if (!rawDateParam || !DATE_RE.test(rawDateParam)) return today;
    return rawDateParam;
  }, [rawDateParam, today]);

  // Editable only within 7 days
  const isEditable = useMemo(() => {
    return isWithinBackfillWindow(activeDate, today, minBackfill);
  }, [activeDate, today, minBackfill]);

  // Subscribe to the selected day's daily doc
  useEffect(() => {
    if (!user?.uid || !activeDate) return;
    setDailyLoaded(false);
    const ref = dailyPath(user.uid, activeDate);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setDailyDoc(snap.exists() ? (snap.data() ?? null) : null);
        setDailyLoaded(true);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setDailyLoaded(true);
      },
    );
    return () => unsub();
  }, [user?.uid, activeDate]);

  const handleDateChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(DATE_PARAM, next);
      router.replace(`/nutrition?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleUpdateMeals = useCallback(
    async (newMeals: LoggedMealItem[]) => {
      if (!user?.uid || !isEditable) return;

      // Sum totals
      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;
      newMeals.forEach((m) => {
        totalCalories += m.calories;
        totalProtein += m.proteinG;
        totalCarbs += m.carbsG;
        totalFat += m.fatG;
      });

      const payload: Partial<DailyDoc> = {
        localDate: activeDate,
        loggedMeals: newMeals,
        calories: totalCalories,
        proteinG: totalProtein,
        carbsG: totalCarbs,
        fatG: totalFat,
        updatedAt: serverTimestamp() as any,
      };

      try {
        await setDoc(dailyPath(user.uid, activeDate), payload, { merge: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update meals.");
      }
    },
    [user?.uid, activeDate, isEditable],
  );

  const handleUpdateProfileFavorites = useCallback(
    async (newFavorites: FavoriteFood[]) => {
      if (!user?.uid || !isEditable) return;
      try {
        await setDoc(
          profilePath(user.uid),
          {
            favoriteFoods: newFavorites,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (err) {
        console.error("Failed to update favorites:", err);
      }
    },
    [user?.uid, isEditable],
  );

  if (!profileLoaded || !effectiveProfile) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-neutral-100">Nutrition</h1>
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 pb-12">
      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Nutrition & Diet</h1>
          <p className="mt-1 text-xs text-muted">
            {activeDate === today ? "Today" : "Archive"} · {activeDate}
          </p>
        </div>
        {activeDate !== today && isEditable && (
          <Link
            href="/nutrition"
            className="text-xs text-accent hover:underline flex items-center gap-0.5"
          >
            Go to Today <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </header>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {/* Date Picker */}
      <div className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <DatePicker
          value={activeDate}
          today={today}
          min={minBackfill}
          onPick={handleDateChange}
        />
      </div>

      {/* Read-only banner */}
      {!isEditable && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
        >
          This date ({activeDate}) is outside the 7-day active logging window. Logs are read-only.
        </div>
      )}

      {/* Meals & Macro Logger */}
      {!dailyLoaded ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-neutral-900/40 p-4">
          <MealLogger
            loggedMeals={dailyDoc?.loggedMeals ?? []}
            profile={effectiveProfile}
            onUpdateMeals={handleUpdateMeals}
            onUpdateProfileFavorites={handleUpdateProfileFavorites}
            readOnly={!isEditable}
          />
        </div>
      )}
    </section>
  );
}
