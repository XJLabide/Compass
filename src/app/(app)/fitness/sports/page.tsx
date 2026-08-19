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
import type { Profile, SessionDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import {
  Trophy,
  ArrowLeft,
  Flame,
  Clock,
  Plus,
  Swords,
  Users,
  Target,
} from "lucide-react";
import CompassLoader from "@/components/ui/CompassLoader";
import SportsLoggerModal from "@/components/fitness/SportsLoggerModal";
import clsx from "clsx";

type RecentRow = { id: string; session: SessionDoc };
const RECENT_LIMIT = 40;
const SPORTS_HERO_IMAGE =
  "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1600&q=80";

const SPORT_ICONS: Record<string, string> = {
  Basketball: "🏀",
  Soccer: "⚽",
  Tennis: "🎾",
  Swimming: "🏊",
  Cycling: "🚴",
  Badminton: "🏸",
  Volleyball: "🏐",
  "Martial Arts": "🥊",
  "General Sports": "⚡",
};

const FAVORITE_SPORTS = [
  { name: "Basketball", icon: "🏀", desc: "Pickup or league game" },
  { name: "Soccer", icon: "⚽", desc: "Match or practice" },
  { name: "Tennis", icon: "🎾", desc: "Singles or doubles" },
  { name: "Swimming", icon: "🏊", desc: "Laps and cardio" },
  { name: "Badminton", icon: "🏸", desc: "Racket match" },
  { name: "Cycling", icon: "🚴", desc: "Road or mountain" },
  { name: "Volleyball", icon: "🏐", desc: "Beach or indoor" },
  { name: "Martial Arts", icon: "🥊", desc: "Sparring and drills" },
];

export default function CuratedSportsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recent, setRecent] = useState<RecentRow[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSport, setSelectedSport] = useState("Basketball");

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
          .filter((r) => r.session.activityType === "sports");
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

  const stats = useMemo(() => {
    if (!recent) return { wins: 0, losses: 0, draws: 0, totalMin: 0, matchCount: 0 };

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalMin = 0;
    let matchCount = 0;

    for (const row of recent) {
      const s = row.session;
      totalMin += s.durationMin ?? 0;

      if (s.gameType === "match") {
        matchCount += 1;
        if (s.matchOutcome === "win") wins += 1;
        else if (s.matchOutcome === "loss") losses += 1;
        else if (s.matchOutcome === "draw") draws += 1;
      }
    }

    return { wins, losses, draws, totalMin, matchCount };
  }, [recent]);

  const handleLaunchSport = (sportName: string) => {
    setSelectedSport(sportName);
    setModalOpen(true);
  };

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
        className="mt-3 overflow-hidden rounded-xl border border-violet-400/20 bg-cover bg-center"
        style={{ backgroundImage: `url(${SPORTS_HERO_IMAGE})` }}
      >
        <div className="bg-gradient-to-b from-black/25 via-bg/60 to-bg p-4 pt-28 sm:p-6 sm:pt-36">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-violet-200">
                <Trophy className="h-4 w-4" />
                {localDate}
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Sports & Games
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-neutral-300">
                Log pickup games, match outcomes, opponents, scores, and active
                minutes without digging through forms.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleLaunchSport("Basketball")}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-violet-400 px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-300 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Log Sport
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-xl">
            <div className="rounded-lg border border-white/10 bg-black/35 p-3 backdrop-blur-sm">
              <span className="flex items-center gap-1 text-[11px] text-neutral-300">
                <Swords className="h-3 w-3 text-violet-200" />
                Matches
              </span>
              <strong className="mt-1 block text-sm font-semibold sm:text-base">
                {stats.matchCount}
              </strong>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3 backdrop-blur-sm">
              <span className="flex items-center gap-1 text-[11px] text-neutral-300">
                <Target className="h-3 w-3 text-emerald-300" />
                Record
              </span>
              <strong className="mt-1 block text-sm font-semibold text-emerald-200 sm:text-base">
                {stats.wins}-{stats.losses}-{stats.draws}
              </strong>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3 backdrop-blur-sm">
              <span className="flex items-center gap-1 text-[11px] text-neutral-300">
                <Clock className="h-3 w-3 text-amber-300" />
                Time
              </span>
              <strong className="mt-1 block text-sm font-semibold sm:text-base">
                {stats.totalMin} min
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-base font-semibold">Quick log</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FAVORITE_SPORTS.map((sp) => (
            <button
              key={sp.name}
              type="button"
              onClick={() => handleLaunchSport(sp.name)}
              className="min-h-[112px] rounded-lg border border-border bg-panel p-4 text-left transition-colors hover:border-violet-400/50 hover:bg-panel2"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none">{sp.icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100">{sp.name}</h3>
                  <p className="mt-1 text-xs text-muted">{sp.desc}</p>
                </div>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-violet-300">
                Log session
                <Users className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-base font-semibold">Recent games</h2>

        {!loaded ? (
          <CompassLoader mode="card" size="md" label="Loading match history..." />
        ) : !recent || recent.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-panel p-6 text-center">
            <Trophy className="mx-auto h-8 w-8 text-purple-400/50" />
            <p className="mt-2 text-sm font-semibold text-neutral-300">No sports games logged yet</p>
            <p className="mt-1 text-xs text-muted">Tap any sport above to log your first match or pickup session.</p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {recent.map(({ id, session }) => {
              const sportEmoji = SPORT_ICONS[session.sportName ?? ""] ?? "⚡";
              const isMatch = session.gameType === "match";
              const outcome = session.matchOutcome ?? "none";

              return (
                <div
                  key={id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-3.5 transition-colors hover:bg-panel2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-xl">
                      {sportEmoji}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-neutral-100">
                          {session.name}
                        </span>

                        {isMatch && (
                          <span
                            className={clsx(
                              "rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                              outcome === "win"
                                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                : outcome === "loss"
                                ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                : outcome === "draw"
                                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                : "bg-purple-500/15 text-purple-300 border-purple-500/30"
                            )}
                          >
                            {outcome === "win"
                              ? "WIN 🏆"
                              : outcome === "loss"
                              ? "LOSS ❌"
                              : outcome === "draw"
                              ? "DRAW 🤝"
                              : "MATCH"}
                          </span>
                        )}
                      </div>

                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span>{session.localDate}</span>
                        {session.durationMin && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {session.durationMin} min
                            </span>
                          </>
                        )}
                        {session.score && (
                          <>
                            <span>•</span>
                            <span className="text-purple-300 font-semibold">{session.score}</span>
                          </>
                        )}
                        {session.opponent && (
                          <>
                            <span>•</span>
                            <span>vs {session.opponent}</span>
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

      <SportsLoggerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        timezone={profile?.timezone}
        initialSport={selectedSport}
      />
    </section>
  );
}
