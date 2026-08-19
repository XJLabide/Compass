"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  limit,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
} from "firebase/firestore";
import { useAuth } from "@/lib/auth/useAuth";
import { profilePath, programPath, sessionsPath } from "@/lib/db/paths";
import type { Profile, ProgramDoc, SessionDoc } from "@/lib/db/types";
import { computeLocalDate, getRotationView } from "@/lib/workout/scheduling";
import {
  Dumbbell,
  Navigation,
  Trophy,
  Activity,
  ArrowRight,
  Flame,
  Clock,
  Settings2,
  PlayCircle,
  Route,
  Users,
} from "lucide-react";
import CompassLoader from "@/components/ui/CompassLoader";
import RunLoggerModal from "@/components/fitness/RunLoggerModal";
import SportsLoggerModal from "@/components/fitness/SportsLoggerModal";
import ResumeBanner from "@/components/workout/ResumeBanner";
import clsx from "clsx";

type RecentRow = { id: string; session: SessionDoc };
const RECENT_LIMIT = 50;
const FITNESS_HERO_IMAGE =
  "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1600&q=80";
const ACTIVITY_IMAGES = {
  strength:
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80",
  running:
    "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80",
  sports:
    "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80",
};

function timestampToDate(ts: unknown): Date | null {
  if (!ts) return null;
  const t = ts as { toDate?: () => Date };
  if (typeof t.toDate !== "function") return null;
  try {
    return t.toDate();
  } catch {
    return null;
  }
}

export default function FitnessPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [program, setProgram] = useState<ProgramDoc | null>(null);
  const [programLoaded, setProgramLoaded] = useState(false);

  const [recent, setRecent] = useState<RecentRow[] | null>(null);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [inProgress, setInProgress] = useState<RecentRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [runModalOpen, setRunModalOpen] = useState(false);
  const [sportsModalOpen, setSportsModalOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      profilePath(user.uid),
      (snap) => setProfile(snap.data() ?? null),
      (err) => setLoadError(err.message),
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      programPath(user.uid),
      (snap) => {
        setProgram(snap.data() ?? null);
        setProgramLoaded(true);
      },
      (err) => {
        setLoadError(err.message);
        setProgramLoaded(true);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      sessionsPath(user.uid),
      orderBy("date", "desc"),
      limit(RECENT_LIMIT),
    );
    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<SessionDoc>) => {
        const rows = snap.docs.map((d) => ({ id: d.id, session: d.data() }));
        setRecent(rows);
        setRecentLoaded(true);
        const inProg = rows.find((r) => r.session.status === "in_progress");
        setInProgress(inProg ?? null);
      },
      (err) => {
        setLoadError(err.message);
        setRecent([]);
        setRecentLoaded(true);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  const localDate = useMemo(() => {
    const tz = profile?.timezone || "UTC";
    return computeLocalDate(new Date(), tz);
  }, [profile?.timezone]);

  const rotation = useMemo(() => {
    if (!programLoaded || !recentLoaded) return null;
    const map = new Map<string, Date>();
    if (!program || program.sessions.length === 0) {
      return getRotationView(program, map);
    }
    const idSet = new Set(program.sessions.map((s) => s.id));

    for (const row of recent ?? []) {
      const s = row.session;
      if (s.status && s.status !== "completed") continue;
      if (s.activityType && s.activityType !== "weight_lifting") continue;
      if (!s.programSessionId || !idSet.has(s.programSessionId)) continue;
      if (map.has(s.programSessionId)) continue;

      const completedAt =
        timestampToDate(s.startedAt) ??
        timestampToDate(s.finishedAt) ??
        timestampToDate(s.date) ??
        timestampToDate(s.createdAt);
      if (completedAt) map.set(s.programSessionId, completedAt);
    }
    return getRotationView(program, map);
  }, [program, programLoaded, recent, recentLoaded]);

  const weeklySummary = useMemo(() => {
    if (!recent) return { totalActiveMin: 0, totalDistKm: 0, totalSessions: 0 };

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalActiveMin = 0;
    let totalDistKm = 0;
    let totalSessions = 0;

    for (const row of recent) {
      const s = row.session;
      if (s.status === "discarded") continue;
      const d = timestampToDate(s.date) ?? timestampToDate(s.createdAt);
      if (!d || d < sevenDaysAgo) continue;

      totalSessions += 1;
      totalActiveMin += s.durationMin ?? 0;
      totalDistKm += s.distanceKm ?? 0;
    }

    return {
      totalActiveMin,
      totalDistKm: Math.round(totalDistKm * 10) / 10,
      totalSessions,
    };
  }, [recent]);

  const activitySummary = useMemo(() => {
    const rows = recent ?? [];
    let strengthSessions = 0;
    let runningSessions = 0;
    let sportsSessions = 0;
    let runningKm = 0;
    let matchCount = 0;

    for (const row of rows) {
      const session = row.session;
      if (session.status === "discarded") continue;
      const activityType = session.activityType ?? "weight_lifting";

      if (activityType === "running") {
        runningSessions += 1;
        runningKm += session.distanceKm ?? 0;
      } else if (activityType === "sports") {
        sportsSessions += 1;
        if (session.gameType === "match") matchCount += 1;
      } else {
        strengthSessions += 1;
      }
    }

    return {
      strengthSessions,
      runningSessions,
      sportsSessions,
      runningKm: Math.round(runningKm * 10) / 10,
      matchCount,
    };
  }, [recent]);

  return (
    <section className="pb-12 text-neutral-100">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Fitness Hub</h1>
          <p className="mt-1 text-xs text-muted">{localDate}</p>
        </div>
        <Link
          href="/workout/program"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-panel px-3 text-xs font-medium text-neutral-100 transition-colors hover:bg-panel2"
        >
          <Settings2 className="h-3.5 w-3.5 text-accent" />
          <span className="hidden sm:inline">Program Settings</span>
        </Link>
      </div>

      {loadError && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {loadError}
        </div>
      )}

      {user?.uid && (
        <div className="mt-4">
          <ResumeBanner uid={user.uid} inProgress={inProgress} />
        </div>
      )}

      <div
        className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-cover bg-center"
        style={{ backgroundImage: `url(${FITNESS_HERO_IMAGE})` }}
      >
        <div className="bg-gradient-to-b from-black/20 via-bg/62 to-bg p-4 pt-28 sm:p-6 sm:pt-36">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
                <Activity className="h-4 w-4 text-accent" />
                {weeklySummary.totalSessions} sessions this week
              </div>
              <h2 className="mt-2 max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">
                Choose your training lane.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-300">
                Strength, running, and games stay separated, but your week stays
                visible in one place.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
              <button
                type="button"
                onClick={() => router.push("/fitness/weight-lifting")}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-cyan-300"
              >
                <PlayCircle className="h-4 w-4" />
                Strength
              </button>
              <button
                type="button"
                onClick={() => setRunModalOpen(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-black/35 px-4 text-sm font-semibold text-neutral-100 transition-colors hover:bg-black/50"
              >
                <Route className="h-4 w-4 text-cyan-300" />
                Log Run
              </button>
              <button
                type="button"
                onClick={() => setSportsModalOpen(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-black/35 px-4 text-sm font-semibold text-neutral-100 transition-colors hover:bg-black/50"
              >
                <Users className="h-4 w-4 text-violet-200" />
                Log Sport
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-xl">
            <div className="rounded-lg border border-white/10 bg-black/35 p-3 backdrop-blur-sm">
              <span className="text-[11px] text-neutral-300">Time</span>
              <strong className="mt-1 block text-sm font-semibold sm:text-base">
                {weeklySummary.totalActiveMin} min
              </strong>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3 backdrop-blur-sm">
              <span className="text-[11px] text-neutral-300">Distance</span>
              <strong className="mt-1 block text-sm font-semibold text-cyan-200 sm:text-base">
                {weeklySummary.totalDistKm} km
              </strong>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3 backdrop-blur-sm">
              <span className="text-[11px] text-neutral-300">Logged</span>
              <strong className="mt-1 block text-sm font-semibold text-emerald-200 sm:text-base">
                {weeklySummary.totalSessions}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-base font-semibold">Activities</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => router.push("/fitness/weight-lifting")}
            className="group min-h-[240px] overflow-hidden rounded-xl border border-emerald-400/20 bg-cover bg-center text-left transition-colors hover:border-emerald-300/50"
            style={{ backgroundImage: `url(${ACTIVITY_IMAGES.strength})` }}
          >
            <div className="flex h-full min-h-[240px] flex-col justify-end bg-gradient-to-b from-black/10 via-black/25 to-bg p-4">
              <Dumbbell className="h-6 w-6 text-emerald-300" />
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                Strength
              </h3>
              <p className="mt-1 text-sm text-neutral-300">
                {rotation?.next
                  ? `Next up: ${rotation.next.name}`
                  : `${activitySummary.strengthSessions} sessions logged`}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-sm font-semibold text-emerald-200">
                  Open Strength Hub
                </span>
                <ArrowRight className="h-4 w-4 text-emerald-200" />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => router.push("/fitness/running")}
            className="group min-h-[240px] overflow-hidden rounded-xl border border-cyan-400/20 bg-cover bg-center text-left transition-colors hover:border-cyan-300/50"
            style={{ backgroundImage: `url(${ACTIVITY_IMAGES.running})` }}
          >
            <div className="flex h-full min-h-[240px] flex-col justify-end bg-gradient-to-b from-black/10 via-black/25 to-bg p-4">
              <Navigation className="h-6 w-6 text-cyan-300" />
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                Run & Outdoor
              </h3>
              <p className="mt-1 text-sm text-neutral-300">
                {activitySummary.runningKm > 0
                  ? `${activitySummary.runningKm} km across ${activitySummary.runningSessions} runs`
                  : "Distance, pace, and presets"}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-sm font-semibold text-cyan-200">
                  Open Running Hub
                </span>
                <ArrowRight className="h-4 w-4 text-cyan-200" />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => router.push("/fitness/sports")}
            className="group min-h-[240px] overflow-hidden rounded-xl border border-violet-400/20 bg-cover bg-center text-left transition-colors hover:border-violet-300/50"
            style={{ backgroundImage: `url(${ACTIVITY_IMAGES.sports})` }}
          >
            <div className="flex h-full min-h-[240px] flex-col justify-end bg-gradient-to-b from-black/10 via-black/25 to-bg p-4">
              <Trophy className="h-6 w-6 text-violet-200" />
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                Sports & Games
              </h3>
              <p className="mt-1 text-sm text-neutral-300">
                {activitySummary.matchCount > 0
                  ? `${activitySummary.matchCount} matches tracked`
                  : `${activitySummary.sportsSessions} sessions logged`}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-sm font-semibold text-violet-200">
                  Open Sports Hub
                </span>
                <ArrowRight className="h-4 w-4 text-violet-200" />
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-panel p-4 sm:p-5">
        <h2 className="text-base font-semibold">Weekly snapshot</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-bg p-3">
            <span className="block text-xs text-muted">Active time</span>
            <span className="mt-1 block text-xl font-semibold text-neutral-100">
              {weeklySummary.totalActiveMin}{" "}
              <span className="text-xs font-normal text-muted">min</span>
            </span>
          </div>

          <div className="rounded-lg border border-border bg-bg p-3">
            <span className="block text-xs text-muted">Distance</span>
            <span className="mt-1 block text-xl font-semibold text-cyan-300">
              {weeklySummary.totalDistKm}{" "}
              <span className="text-xs font-normal text-muted">km</span>
            </span>
          </div>

          <div className="rounded-lg border border-border bg-bg p-3">
            <span className="block text-xs text-muted">Logged</span>
            <span className="mt-1 block text-xl font-semibold text-emerald-300">
              {weeklySummary.totalSessions}{" "}
              <span className="text-xs font-normal text-muted">sessions</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-base font-semibold">Recent activity</h2>

        {!recentLoaded ? (
          <CompassLoader mode="card" size="md" label="Loading activity stream..." />
        ) : !recent || recent.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-panel p-6 text-center">
            <Activity className="mx-auto h-8 w-8 text-muted/50" />
            <p className="mt-2 text-sm font-semibold text-neutral-300">No activity logged yet</p>
            <p className="mt-1 text-xs text-muted">Pick an activity above to record your first workout.</p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {recent.slice(0, 10).map(({ id, session }) => {
              const actType = session.activityType ?? "weight_lifting";
              const isRun = actType === "running";
              const isSports = actType === "sports";

              return (
                <div
                  key={id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-3.5 transition-colors hover:bg-panel2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={clsx(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        isRun
                          ? "bg-cyan-500/15 text-cyan-400"
                          : isSports
                          ? "bg-purple-500/15 text-purple-400"
                          : "bg-emerald-500/15 text-emerald-400"
                      )}
                    >
                      {isRun ? (
                        <Navigation className="h-5 w-5" />
                      ) : isSports ? (
                        <Trophy className="h-5 w-5" />
                      ) : (
                        <Dumbbell className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-neutral-100">
                          {session.name}
                        </span>
                        <span
                          className={clsx(
                            "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            isRun
                              ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                              : isSports
                              ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                              : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                          )}
                        >
                          {isRun ? "Run" : isSports ? "Sports" : "Strength"}
                        </span>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span>{session.localDate}</span>
                        {session.durationMin && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-muted" />
                              {session.durationMin} min
                            </span>
                          </>
                        )}
                        {session.distanceKm && (
                          <>
                            <span>•</span>
                            <span className="text-cyan-300 font-medium">{session.distanceKm} km</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {session.caloriesBurned && (
                    <div className="sm:text-right">
                      <span className="flex items-center gap-1 text-xs font-semibold text-neutral-200">
                        <Flame className="h-3.5 w-3.5 text-amber-400" />
                        {session.caloriesBurned} kcal
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <RunLoggerModal
        open={runModalOpen}
        onClose={() => setRunModalOpen(false)}
        timezone={profile?.timezone}
      />

      <SportsLoggerModal
        open={sportsModalOpen}
        onClose={() => setSportsModalOpen(false)}
        timezone={profile?.timezone}
      />
    </section>
  );
}
