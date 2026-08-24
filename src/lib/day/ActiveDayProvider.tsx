"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { serverTimestamp, setDoc } from "firebase/firestore";

import { useUserData } from "@/lib/data/UserDataProvider";
import { profilePath } from "@/lib/db/paths";
import { computeLocalDate } from "@/lib/workout/scheduling";

type ActiveDayContextValue = {
  activeDate: string;
  actualDate: string;
  timezone: string;
  isCarriedOver: boolean;
  endDay: () => Promise<void>;
  saving: boolean;
  error: string | null;
};

const ActiveDayContext = createContext<ActiveDayContextValue | null>(null);

function addDaysIso(localDate: string, delta: number): string {
  const t = Date.parse(`${localDate}T00:00:00Z`);
  if (Number.isNaN(t)) return localDate;
  return new Date(t + delta * 86_400_000).toISOString().slice(0, 10);
}

export function ActiveDayProvider({ children }: { children: ReactNode }) {
  const { uid, profile, effectiveProfile } = useUserData();
  const timezone = effectiveProfile?.timezone ?? "UTC";
  const [now, setNow] = useState<Date>(() => new Date());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const actualDate = useMemo(() => computeLocalDate(now, timezone), [now, timezone]);
  const activeDate = profile?.activeDayDate || actualDate;
  const isCarriedOver = activeDate < actualDate;

  const endDay = useCallback(async () => {
    if (!uid) return;
    setSaving(true);
    setError(null);
    try {
      const nextDate = actualDate > activeDate ? actualDate : addDaysIso(activeDate, 1);
      await setDoc(
        profilePath(uid),
        {
          activeDayDate: nextDate,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end day.");
    } finally {
      setSaving(false);
    }
  }, [activeDate, actualDate, uid]);

  const value = useMemo<ActiveDayContextValue>(
    () => ({
      activeDate,
      actualDate,
      timezone,
      isCarriedOver,
      endDay,
      saving,
      error,
    }),
    [activeDate, actualDate, endDay, error, isCarriedOver, saving, timezone],
  );

  return (
    <ActiveDayContext.Provider value={value}>
      {children}
    </ActiveDayContext.Provider>
  );
}

export function useActiveDay(): ActiveDayContextValue {
  const value = useContext(ActiveDayContext);
  if (!value) {
    throw new Error("useActiveDay must be used inside ActiveDayProvider");
  }
  return value;
}
