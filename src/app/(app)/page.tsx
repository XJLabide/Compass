"use client";

import { useUserData } from "@/lib/data/UserDataProvider";

import TodayCard from "@/components/dashboard/TodayCard";
import GoalBanner from "@/components/dashboard/GoalBanner";
import ThisWeekCard from "@/components/dashboard/ThisWeekCard";
import Trends from "@/components/dashboard/Trends";
import RecentPRsStrip from "@/components/dashboard/RecentPRsStrip";
import StreakCard from "@/components/dashboard/StreakCard";
import ActivityHeatmap from "@/components/dashboard/ActivityHeatmap";
import VolumeByMuscle from "@/components/dashboard/VolumeByMuscle";
import ConsistencyCard from "@/components/dashboard/ConsistencyCard";
import TodoSummary from "@/components/dashboard/TodoSummary";
import MoneySummary from "@/components/dashboard/MoneySummary";
import EmptyState from "@/components/dashboard/EmptyState";
import Skeleton from "@/components/ui/Skeleton";

/**
 * `/` — dashboard home.
 *
 * Layout strategy:
 *   - Top section "Today" — quick actions for the day (Today + Goal side-by-side on lg+)
 *   - "Daily" section — Todos and Money (always relevant)
 *   - "Habits" section — Streak + Consistency rings
 *   - "Fitness" section — This week, activity heatmap, trends, volume by muscle
 *   - "PRs" — Recent PRs strip at the bottom
 *
 * Visual rhythm: subtle dividers between sections via section header + small
 * top margin. Cards share the same surface treatment so the dividers do the
 * grouping work.
 */
export default function HomePage() {
  const { uid, profile, profileLoaded, effectiveProfile, error } = useUserData();

  if (!uid) return null;

  if (!profileLoaded || !effectiveProfile) {
    return (
      <section className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Home</h1>
        </header>
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </section>
    );
  }

  const tz = effectiveProfile.timezone;
  const units = effectiveProfile.unitSystem;
  const profileMissing = !profile;

  return (
    <section className="space-y-6">
      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          Home
        </h1>
        {effectiveProfile.displayName ? (
          <span className="text-xs text-muted">
            Hi, {effectiveProfile.displayName}
          </span>
        ) : null}
      </header>

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      {profileMissing ? (
        <EmptyState
          title="Finish setup"
          description="Set your weekly gain target and units to unlock real trends."
          ctaLabel="Open settings"
          href="/settings"
        />
      ) : null}

      {/* TODAY ---------------------------------------------------------- */}
      <DashboardSection title="Today">
        <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start space-y-4 lg:space-y-0">
          <TodayCard uid={uid} timezone={tz} />
          <GoalBanner
            uid={uid}
            timezone={tz}
            weeklyGainLb={effectiveProfile.weeklyGainLb}
            unitSystem={units}
          />
        </div>
      </DashboardSection>

      {/* DAILY (todos + money) ------------------------------------------ */}
      <DashboardSection title="Daily">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TodoSummary uid={uid} />
          <MoneySummary uid={uid} timezone={tz} />
        </div>
      </DashboardSection>

      {/* HABITS --------------------------------------------------------- */}
      <DashboardSection title="Habits">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StreakCard uid={uid} timezone={tz} />
          <ConsistencyCard
            uid={uid}
            timezone={tz}
            proteinTargetG={effectiveProfile.proteinTargetG}
          />
        </div>
      </DashboardSection>

      {/* FITNESS -------------------------------------------------------- */}
      <DashboardSection title="Fitness">
        <ThisWeekCard uid={uid} timezone={tz} unitSystem={units} />
        <ActivityHeatmap uid={uid} timezone={tz} />
        <Trends uid={uid} timezone={tz} unitSystem={units} />
        <VolumeByMuscle uid={uid} unitSystem={units} />
      </DashboardSection>

      {/* PRs ------------------------------------------------------------ */}
      <DashboardSection title="Recent PRs">
        <RecentPRsStrip uid={uid} unitSystem={units} />
      </DashboardSection>
    </section>
  );
}

function DashboardSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
