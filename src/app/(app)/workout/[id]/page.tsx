"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { onSnapshot } from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { sessionPath } from "@/lib/db/paths";
import type { SessionDoc } from "@/lib/db/types";

/**
 * `/workout/[id]` — session detail.
 *
 * v1 placeholder: read-only view that confirms the session doc exists and
 * shows its core metadata. The live logger UI is built in later tasks of this
 * epic; this page exists so that "Start session" and the recent-sessions list
 * have a working destination.
 */
export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const { user } = useAuth();

  const [session, setSession] = useState<SessionDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.uid || !sessionId) return;
    const unsub = onSnapshot(
      sessionPath(user.uid, sessionId),
      (snap) => {
        setSession(snap.data() ?? null);
        setLoaded(true);
      },
      (err) => {
        setError(err.message);
        setLoaded(true);
      },
    );
    return () => unsub();
  }, [user?.uid, sessionId]);

  return (
    <section>
      <Link
        href="/workout"
        className="text-xs font-medium text-muted hover:text-neutral-200"
      >
        ← Workout
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-100">
        {session?.name ?? "Session"}
      </h1>

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      {!loaded ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : !session ? (
        <p className="mt-4 text-sm text-muted">Session not found.</p>
      ) : (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-neutral-900/40 p-4 text-sm text-neutral-200">
          <div className="flex justify-between gap-3">
            <span className="text-muted">Date</span>
            <span>{session.localDate}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted">Status</span>
            <span>{session.status ?? "completed"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted">Sets logged</span>
            <span>
              {Array.isArray(session.sets) ? session.sets.length : 0}
            </span>
          </div>
          <p className="pt-2 text-xs text-muted">
            The live logger UI ships in a later task of this epic.
          </p>
        </div>
      )}
    </section>
  );
}
