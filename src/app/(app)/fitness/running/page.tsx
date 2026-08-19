"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  limit,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
} from "firebase/firestore";
import { useAuth } from "@/lib/auth/useAuth";
import { profilePath, sessionsPath } from "@/lib/db/paths";
import type { Profile, RunType, SessionDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import {
  Navigation,
  ArrowLeft,
  Flame,
  Trophy,
  Zap,
  Plus,
  Route,
  Gauge,
} from "lucide-react";
import CompassLoader from "@/components/ui/CompassLoader";
import RunLoggerModal from "@/components/fitness/RunLoggerModal";

type RecentRow = { id: string; session: SessionDoc };
const RECENT_LIMIT = 40;
const WEEKLY_GOAL_KM = 20;
const RUN_HERO_IMAGE =
  "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1600&q=80";

const RUN_PRESETS: Array<{
  type: RunType;
  label: string;
  title: string;
  detail: string;
  distance: string;
}> = [
  {
    type: "easy",
    label: "Recovery",
    title: "Easy Recovery",
    detail: "Low heart-rate miles",
    distance: "5 km",
  },
  {
    type: "tempo",
    label: "Pace",
    title: "5K Tempo",
    detail: "Controlled faster effort",
    distance: "5 km",
  },
  {
    type: "intervals",
    label: "Speed",
    title: "Intervals",
    detail: "Short hard repeats",
    distance: "4 km",
  },
  {
    type: "long_run",
    label: "Endurance",
    title: "Long Run",
    detail: "Steady distance builder",
    distance: "10 km",
  },
];

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

export default function CuratedRunningPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recent, setRecent] = useState<RecentRow[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRunType, setSelectedRunType] = useState<RunType>("general");

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      profilePath(user.uid),
      (snap) => setProfile(snap.data() ?? null),
      (err) => setError(err.message),
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
        const rows = snap.docs
          .map((d) => ({ id: d.id, session: d.data() }))
          .filter((r) => r.session.activityType === "running");
        setRecent(rows);
        setLoaded(true);
      },
      (err) => {
        setError(err.message);
        setRecent([]);
        setLoaded(true);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  const localDate = useMemo(() => {
    const tz = profile?.timezone || "UTC";
    return computeLocalDate(new Date(), tz);
  }, [profile?.timezone]);

  const analytics = useMemo(() => {
    if (!recent)
      return {
        weeklyKm: 0,
        longestKm: 0,
        fastestPaceMin: 0,
        totalRuns: 0,
      };

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let weeklyKm = 0;
    let longestKm = 0;
    let fastestPaceMin = Infinity;
    const totalRuns = recent.length;

    for (const row of recent) {
      const s = row.session;
      const d = timestampToDate(s.date) ?? timestampToDate(s.createdAt);

      const dist = s.distanceKm ?? 0;
      if (dist > longestKm) longestKm = dist;

      const pace = s.paceMinPerKm ?? 0;
      if (pace > 0 && pace < fastestPaceMin) fastestPaceMin = pace;

      if (d && d >= sevenDaysAgo) {
        weeklyKm += dist;
      }
    }

    return {
      weeklyKm: Math.round(weeklyKm * 10) / 10,
      longestKm: Math.round(longestKm * 10) / 10,
      fastestPaceMin: fastestPaceMin === Infinity ? 0 : fastestPaceMin,
      totalRuns,
    };
  }, [recent]);

  const handleLaunchPreset = (type: RunType) => {
    setSelectedRunType(type);
    setModalOpen(true);
  };

  const formatPace = (paceMin: number) => {
    if (paceMin <= 0) return "--:-- /km";
    const mins = Math.floor(paceMin);
    const secs = Math.round((paceMin - mins) * 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs} /km`;
  };

  const weeklyProgress = Math.min(
    100,
    Math.round((analytics.weeklyKm / WEEKLY_GOAL_KM) * 100),
  );
  const remainingKm = Math.max(
    0,
    Math.round((WEEKLY_GOAL_KM - analytics.weeklyKm) * 10) / 10,
  );

  return (
    <section className="pb-12 text-neutral-100">
      <div>
        <Link
          href="/fitness"
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Fitness Hub
        </Link>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div
        className="mt-3 overflow-hidden rounded-xl border border-cyan-400/20 bg-cover bg-center"
        style={{ backgroundImage: `url(${RUN_HERO_IMAGE})` }}
      >
        <div className="bg-gradient-to-b from-black/25 via-bg/58 to-bg p-4 pt-28 sm:p-6 sm:pt-36">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-cyan-200">
                <Navigation className="h-4 w-4" />
                {localDate}
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Run & Outdoor
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-neutral-300">
                Track distance, pace, route work, and weekly volume from one
                focused running hub.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleLaunchPreset("general")}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-cyan-300 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Log Run
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-xl">
            <div className="rounded-lg border border-white/10 bg-black/35 p-3 backdrop-blur-sm">
              <span className="flex items-center gap-1 text-[11px] text-neutral-300">
                <Gauge className="h-3 w-3 text-cyan-300" />
                Fastest
              </span>
              <strong className="mt-1 block text-sm font-semibold text-cyan-200 sm:text-base">
                {formatPace(analytics.fastestPaceMin)}
              </strong>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3 backdrop-blur-sm">
              <span className="flex items-center gap-1 text-[11px] text-neutral-300">
                <Route className="h-3 w-3 text-emerald-300" />
                Longest
              </span>
              <strong className="mt-1 block text-sm font-semibold sm:text-base">
                {analytics.longestKm} km
              </strong>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3 backdrop-blur-sm">
              <span className="flex items-center gap-1 text-[11px] text-neutral-300">
                <Trophy className="h-3 w-3 text-amber-300" />
                Runs
              </span>
              <strong className="mt-1 block text-sm font-semibold sm:text-base">
                {analytics.totalRuns}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-cyan-400/20 bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Weekly target</h2>
            <p className="mt-1 text-xs text-muted">
              {remainingKm} km left to hit {WEEKLY_GOAL_KM} km.
            </p>
          </div>
          <span className="text-sm font-semibold text-cyan-200">
            {analytics.weeklyKm} / {WEEKLY_GOAL_KM} km
          </span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-950">
          <div
            className="h-full rounded-full bg-cyan-400 transition-all duration-500"
            style={{ width: `${weeklyProgress}%` }}
          />
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-base font-semibold">Run presets</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RUN_PRESETS.map((preset) => (
            <button
              key={preset.type}
              type="button"
              onClick={() => handleLaunchPreset(preset.type)}
              className="min-h-[116px] rounded-lg border border-border bg-panel p-4 text-left transition-colors hover:border-cyan-400/50 hover:bg-panel2"
            >
              <span className="text-xs font-medium text-cyan-300">{preset.label}</span>
              <h3 className="mt-2 text-base font-semibold">{preset.title}</h3>
              <p className="mt-1 text-xs text-muted">{preset.detail}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300">
                Start {preset.distance}
                <Route className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-base font-semibold">Recent runs</h2>

        {!loaded ? (
          <CompassLoader mode="card" size="md" label="Loading run history..." />
        ) : !recent || recent.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-panel p-6 text-center">
            <Navigation className="mx-auto h-8 w-8 text-cyan-400/50" />
            <p className="mt-2 text-sm font-semibold text-neutral-300">No runs logged yet</p>
            <p className="mt-1 text-xs text-muted">Use the presets above or tap &quot;Log Run&quot; to record your first run.</p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {recent.map(({ id, session }) => (
              <div
                key={id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-3.5 transition-colors hover:bg-panel2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
                    <Navigation className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-neutral-100">
                        {session.name}
                      </span>
                      {session.distanceKm && (
                        <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                          {session.distanceKm} km
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span>{session.localDate}</span>
                      {session.durationMin && (
                        <>
                          <span>•</span>
                          <span>{session.durationMin} min</span>
                        </>
                      )}
                      {session.paceMinPerKm && (
                        <>
                          <span>•</span>
                          <span className="text-cyan-300 font-medium">{formatPace(session.paceMinPerKm)}</span>
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
            ))}
          </div>
        )}
      </div>

      <RunLoggerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        timezone={profile?.timezone}
        initialRunType={selectedRunType}
      />
    </section>
  );
}
