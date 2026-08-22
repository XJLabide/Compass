"use client";

import { useEffect, useState } from "react";

export default function PwaRuntime() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let disposed = false;

    const onControllerChange = () => {
      if (refreshing) return;
      setRefreshing(true);
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (disposed) return;

        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(worker);
            }
          });
        });
      })
      .catch((err: unknown) => {
        console.warn("PWA service worker registration failed:", err);
      });

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, [refreshing]);

  if (!waitingWorker) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 z-50 rounded-xl border border-white/10 bg-neutral-950/95 p-3 shadow-2xl shadow-black/40 backdrop-blur md:left-auto md:right-4 md:w-80"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
    >
      <p className="text-sm font-medium text-neutral-100">
        A new Compass version is ready.
      </p>
      <button
        type="button"
        onClick={() => waitingWorker.postMessage({ type: "SKIP_WAITING" })}
        className="mt-2 h-10 w-full rounded-lg bg-accent px-4 text-sm font-semibold text-neutral-950"
      >
        Update now
      </button>
    </div>
  );
}
