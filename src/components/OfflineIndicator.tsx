"use client";

import { useEffect, useState } from "react";

/**
 * OfflineIndicator
 *
 * Subscribes to the browser's `online` / `offline` window events and renders a
 * small pill at the top of the app shell when the browser reports offline.
 *
 * Writes still succeed because Firestore offline persistence is enabled (see
 * `src/lib/firebase.ts`); this pill exists purely to reassure the user.
 */
export default function OfflineIndicator() {
  // Default to `true` (online) on the server and during the first client paint
  // to avoid a hydration mismatch. We sync with `navigator.onLine` in the
  // effect below.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "onLine" in navigator) {
      setOnline(navigator.onLine);
    }

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // Top inset respects the iOS notch / Dynamic Island so the pill never
      // collides with the status bar when launched standalone.
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <div className="pointer-events-auto rounded-full bg-amber-500/95 px-3 py-1 text-xs font-medium text-white shadow-md ring-1 ring-amber-700/30">
        Offline — changes will sync when you reconnect
      </div>
    </div>
  );
}
