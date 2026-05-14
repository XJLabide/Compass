"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";

import { useUserData } from "@/lib/data/UserDataProvider";
import { dailyCollectionPath } from "@/lib/db/paths";
import { computeLocalDate } from "@/lib/workout/scheduling";

/**
 * Local notification scheduler. Runs while the app tab is open.
 *
 * Behavior:
 *   - Reads `profile.notificationsEnabled` + `profile.reminderTime` (HH:MM).
 *   - At each minute boundary, if current local time matches `reminderTime`
 *     and the user hasn't logged a check-in for the current local date, fires
 *     a single notification.
 *   - Tracks the last-fired date in localStorage so we don't fire repeatedly.
 *
 * This is a v1 implementation — it only fires when the tab is open. A push-
 * server + service worker would enable background notifications, but the
 * value of a 9pm nudge while you're actually using your phone (PWA open in
 * the background) is already significant.
 */
const LAST_FIRED_KEY = "compass.lastReminderFired";

function hasLoggedToday(daily: Record<string, unknown> | undefined): boolean {
  if (!daily) return false;
  const fields = [
    "bodyweightKg",
    "sleepHours",
    "sleepQuality",
    "calories",
    "proteinG",
    "waterMl",
    "steps",
    "mood",
  ];
  for (const k of fields) {
    if (daily[k] !== undefined) return true;
  }
  const note = daily["note"];
  if (typeof note === "string" && note.trim().length > 0) return true;
  return false;
}

export default function NotificationsManager() {
  const { uid, profile, effectiveProfile } = useUserData();
  const enabled = profile?.notificationsEnabled === true;
  const reminderTime = profile?.reminderTime ?? "21:00";
  const tz = effectiveProfile?.timezone ?? "UTC";

  const [loggedToday, setLoggedToday] = useState<boolean | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to today's daily doc so we know if the user has logged anything.
  useEffect(() => {
    if (!uid || !enabled) {
      setLoggedToday(null);
      return;
    }
    const today = computeLocalDate(new Date(), tz);
    const q = query(
      dailyCollectionPath(uid),
      where("localDate", "==", today),
      orderBy("localDate", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const doc = snap.docs[0]?.data() as unknown as
          | Record<string, unknown>
          | undefined;
        setLoggedToday(hasLoggedToday(doc));
      },
      () => setLoggedToday(false),
    );
    return () => unsub();
  }, [uid, enabled, tz]);

  // Minute-tick scheduler.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    const tick = () => {
      if (Notification.permission !== "granted") return;
      if (loggedToday !== false) return; // null = unknown, true = already logged
      const now = new Date();
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);
      if (local !== reminderTime) return;
      const today = computeLocalDate(now, tz);
      const lastFired = localStorage.getItem(LAST_FIRED_KEY);
      if (lastFired === today) return;
      try {
        new Notification("Compass — daily check-in", {
          body: "You haven't logged today yet. Two taps and you're done.",
          icon: "/icon-192.png",
          tag: `compass-checkin-${today}`,
        });
        localStorage.setItem(LAST_FIRED_KEY, today);
      } catch {
        // Notification construction can throw in some browsers; ignore.
      }
    };

    // Run immediately, then every 30 seconds (safely covers minute changes).
    tick();
    tickRef.current = setInterval(tick, 30_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [enabled, reminderTime, tz, loggedToday]);

  return null;
}

/**
 * Hook for the settings UI: returns the current permission state + a request
 * function that prompts the OS dialog.
 */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => {
      if (typeof window === "undefined" || !("Notification" in window)) {
        return "unsupported";
      }
      return Notification.permission;
    },
  );

  const request = useCallback(async (): Promise<NotificationPermission | "unsupported"> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    const next = await Notification.requestPermission();
    setPermission(next);
    return next;
  }, []);

  return { permission, request };
}
