"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Chrome's `beforeinstallprompt` event isn't in the standard DOM lib yet.
 * We type only the bits we use: `prompt()` and the `userChoice` resolution.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

/**
 * InstallPrompt
 *
 * Renders an "Install app" affordance for browsers that support the
 * PWA install API (Chrome/Edge/Android). On iOS Safari — which never fires
 * `beforeinstallprompt` — falls back to a static "Add to Home Screen" tip.
 *
 * Renders nothing once the app is already installed
 * (`display-mode: standalone` matches) or the user has dismissed the prompt
 * this session.
 */
export default function InstallPrompt() {
  // We hide initially during SSR / first paint and decide what to render
  // after we've inspected the runtime environment.
  const [mounted, setMounted] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Detect already-installed standalone mode.
    if (typeof window !== "undefined" && "matchMedia" in window) {
      const mq = window.matchMedia("(display-mode: standalone)");
      setStandalone(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setStandalone(e.matches);
      mq.addEventListener("change", onChange);

      // iOS Safari sets `navigator.standalone` when launched from the home
      // screen — treat that as standalone too.
      const navStandalone =
        "standalone" in window.navigator &&
        (window.navigator as Navigator & { standalone?: boolean })
          .standalone === true;
      if (navStandalone) setStandalone(true);

      // iOS detection (Safari on iPhone/iPad). MSStream excludes IE-on-WP.
      const ua = window.navigator.userAgent;
      const iOS =
        /iPad|iPhone|iPod/.test(ua) &&
        !(window as unknown as { MSStream?: unknown }).MSStream;
      setIsIos(iOS);

      return () => mq.removeEventListener("change", onChange);
    }
  }, []);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Stash the event so we can fire it from a user gesture later.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
      }
    } finally {
      // Per spec, the event can only be used once. Clear it either way.
      setDeferred(null);
    }
  }, [deferred]);

  if (!mounted) return null;
  if (standalone || installed) return null;

  if (deferred) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-200">Install app</h2>
        <p className="mt-1 text-xs text-muted">
          Install Personal Tracker to your home screen for a full-screen,
          offline-capable experience.
        </p>
        <button
          type="button"
          onClick={handleInstall}
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-neutral-950 transition hover:bg-accent/90"
        >
          Install app
        </button>
      </div>
    );
  }

  if (isIos) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-200">
          Add to Home Screen
        </h2>
        <p className="mt-1 text-xs text-muted">
          In Safari, tap the Share button, then choose
          <span className="font-medium text-neutral-200">
            {" "}
            Add to Home Screen
          </span>
          . The app will launch full-screen and work offline.
        </p>
      </div>
    );
  }

  return null;
}
