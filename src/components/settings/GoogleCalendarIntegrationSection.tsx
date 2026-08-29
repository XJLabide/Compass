"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import clsx from "clsx";

import { getFirebaseAuth } from "@/lib/firebase";

type IntegrationStatus = {
  provider?: string;
  status?: "connected" | "disconnected" | "error";
  setupRequired?: boolean;
  setupMessage?: string | null;
  accountEmail?: string | null;
  accountName?: string | null;
  selectedCalendarIds?: string[];
  lastSyncAt?: { seconds?: number } | null;
  lastSyncError?: string | null;
};

type CalendarOption = {
  id: string;
  summary: string;
  primary: boolean;
};

type ApiError = { error?: string };

function describeIntegrationError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : fallback;
  if (message.includes("Could not load the default credentials")) {
    return "Firebase Admin credentials are missing in production. Add FIREBASE_SERVICE_ACCOUNT_JSON, then redeploy.";
  }
  return message;
}

async function authFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("You need to be signed in.");
  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const json = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) throw new Error(json.error || "Google Calendar request failed.");
  return json;
}

function formatSyncTime(value?: { seconds?: number } | null): string {
  if (!value?.seconds) return "Never synced";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value.seconds * 1000));
}

export default function GoogleCalendarIntegrationSection() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = status?.status === "connected" || status?.status === "error";
  const setupRequired = Boolean(status?.setupRequired);
  const selected = useMemo(
    () => new Set(status?.selectedCalendarIds ?? ["primary"]),
    [status?.selectedCalendarIds],
  );

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch<{ status: IntegrationStatus }>(
        "/api/integrations/google-calendar/status",
      );
      setStatus(data.status);
      if (data.status?.status === "connected" || data.status?.status === "error") {
        const calendarData = await authFetch<{ calendars: CalendarOption[] }>(
          "/api/integrations/google-calendar/calendars",
        );
        setCalendars(calendarData.calendars);
      } else {
        setCalendars([]);
      }
    } catch (err) {
      setError(describeIntegrationError(err, "Failed to load Google Calendar."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const connect = async () => {
    setWorking("connect");
    setError(null);
    try {
      const data = await authFetch<{ authUrl: string }>(
        "/api/integrations/google-calendar/start",
        { method: "POST" },
      );
      window.location.assign(data.authUrl);
    } catch (err) {
      setError(describeIntegrationError(err, "Failed to start connection."));
      setWorking(null);
    }
  };

  const sync = async () => {
    setWorking("sync");
    setError(null);
    setMessage(null);
    try {
      const result = await authFetch<{ upserted: number; deleted: number }>(
        "/api/integrations/google-calendar/sync",
        { method: "POST" },
      );
      setMessage(`Synced ${result.upserted} event${result.upserted === 1 ? "" : "s"}.`);
      await loadStatus();
    } catch (err) {
      setError(describeIntegrationError(err, "Sync failed."));
    } finally {
      setWorking(null);
    }
  };

  const disconnect = async () => {
    setWorking("disconnect");
    setError(null);
    setMessage(null);
    try {
      await authFetch("/api/integrations/google-calendar/status", {
        method: "DELETE",
      });
      setCalendars([]);
      setMessage("Google Calendar disconnected.");
      await loadStatus();
    } catch (err) {
      setError(describeIntegrationError(err, "Disconnect failed."));
    } finally {
      setWorking(null);
    }
  };

  const toggleCalendar = async (calendarId: string) => {
    const next = new Set(selected);
    if (next.has(calendarId)) next.delete(calendarId);
    else next.add(calendarId);
    const calendarIds = Array.from(next);
    setStatus((current) =>
      current ? { ...current, selectedCalendarIds: calendarIds } : current,
    );
    try {
      await authFetch("/api/integrations/google-calendar/calendars", {
        method: "PATCH",
        body: JSON.stringify({ calendarIds }),
      });
    } catch (err) {
      setError(describeIntegrationError(err, "Failed to save calendars."));
      await loadStatus();
    }
  };

  if (loading) {
    return <p className="text-sm text-muted">Loading Google Calendar...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {connected ? (
            <p className="truncate text-sm font-medium text-neutral-100">
              {status?.accountEmail ?? status?.accountName ?? "Connected"}
            </p>
          ) : (
            <p className="text-sm font-medium text-neutral-100">
              {setupRequired ? "Setup required" : "Disconnected"}
            </p>
          )}
          <p className="mt-1 text-xs leading-5 text-muted">
            {connected
              ? "Choose calendars, then run Sync now when you want fresh events."
              : setupRequired
                ? "Add the production Firebase Admin secret before connecting."
                : "Connect an account to enable manual calendar imports."}
          </p>
        </div>

        {connected ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={sync}
              disabled={Boolean(working)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-950 transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={clsx("h-3.5 w-3.5", working === "sync" && "animate-spin")} />
              Sync now
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={Boolean(working)}
              aria-label="Disconnect Google Calendar"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-neutral-900 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Unplug className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={connect}
            disabled={setupRequired || Boolean(working)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-neutral-100 px-3 text-xs font-semibold text-neutral-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Connect
          </button>
        )}
      </div>

      {connected ? (
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-neutral-900/60 px-3 py-2 text-xs text-muted">
            Last sync: {formatSyncTime(status?.lastSyncAt)}
          </div>

          {calendars.length > 0 ? (
            <div className="space-y-2">
              {calendars.map((calendar) => {
                const active = selected.has(calendar.id);
                return (
                  <button
                    key={calendar.id}
                    type="button"
                    onClick={() => toggleCalendar(calendar.id)}
                    className="flex w-full items-center gap-3 rounded-md border border-border bg-neutral-950 px-3 py-2 text-left transition-colors hover:border-neutral-600"
                  >
                    <span
                      className={clsx(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border",
                        active
                          ? "border-accent bg-accent text-neutral-950"
                          : "border-neutral-600 text-transparent",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-100">
                        {calendar.summary}
                      </span>
                      {calendar.primary ? (
                        <span className="text-xs text-muted">Primary calendar</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted">
              No calendars loaded yet. Sync after connecting.
            </p>
          )}
        </div>
      ) : null}

      {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
      {setupRequired && status?.setupMessage ? (
        <p className="text-xs leading-5 text-amber-300">{status.setupMessage}</p>
      ) : null}
      {status?.lastSyncError ? (
        <p className="text-xs text-amber-300">{status.lastSyncError}</p>
      ) : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
