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
import { deleteField, serverTimestamp, setDoc } from "firebase/firestore";

import { useUserData } from "@/lib/data/UserDataProvider";
import { profilePath } from "@/lib/db/paths";
import { computeLocalDate } from "@/lib/workout/scheduling";

type ActiveDayContextValue = {
  activeDate: string;
  actualDate: string;
  timezone: string;
  hasActiveDay: boolean;
  isCarriedOver: boolean;
  startDay: () => Promise<void>;
  endDay: () => Promise<void>;
  saving: boolean;
  error: string | null;
};

const ActiveDayContext = createContext<ActiveDayContextValue | null>(null);

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
  const hasActiveDay = Boolean(profile?.activeDayDate);
  const isCarriedOver = hasActiveDay && activeDate < actualDate;

  const startDay = useCallback(async () => {
    if (!uid) return;
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        profilePath(uid),
        {
          activeDayDate: actualDate,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start day.");
    } finally {
      setSaving(false);
    }
  }, [actualDate, uid]);

  const endDay = useCallback(async () => {
    if (!uid) return;
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        profilePath(uid),
        {
          activeDayDate: deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end day.");
    } finally {
      setSaving(false);
    }
  }, [uid]);

  const value = useMemo<ActiveDayContextValue>(
    () => ({
      activeDate,
      actualDate,
      timezone,
      hasActiveDay,
      isCarriedOver,
      startDay,
      endDay,
      saving,
      error,
    }),
    [activeDate, actualDate, endDay, error, hasActiveDay, isCarriedOver, saving, startDay, timezone],
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
