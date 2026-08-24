"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
import RoutinesSummary from "@/components/dashboard/RoutinesSummary";
import EmptyState from "@/components/dashboard/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import CompassLoader from "@/components/ui/CompassLoader";

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
        <CompassLoader mode="card" size="lg" label="Loading Executive Dashboard..." />
      </section>
    );
  }

  const tz = effectiveProfile.timezone;
  const units = effectiveProfile.unitSystem;
  const profileMissing = !profile;

  return (
    <section className="space-y-7">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
            Home
          </h1>
          <p className="mt-1 text-sm text-muted">
            Today, habits, fitness, and finances in one scan.
          </p>
        </div>
        {effectiveProfile.displayName ? (
          <span className="text-sm text-muted">
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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-stretch">
          <TodayCard uid={uid} timezone={tz} />
          <GoalBanner
            uid={uid}
            timezone={tz}
            weeklyGainLb={effectiveProfile.weeklyGainLb}
            unitSystem={units}
          />
        </div>
      </DashboardSection>

      {/* DAILY (todos + routines + money) ------------------------------- */}
      <DashboardSection title="Daily">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TodoSummary uid={uid} />
          <RoutinesSummary uid={uid} timezone={tz} />
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
      <DashboardSection
        title="Fitness"
        actionHref="/fitness"
        actionLabel="Open fitness"
      >
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-5">
            <ThisWeekCard uid={uid} timezone={tz} unitSystem={units} />
          </div>
          <div className="xl:col-span-7">
            <Trends uid={uid} timezone={tz} unitSystem={units} />
          </div>
          <div className="xl:col-span-5">
            <ActivityHeatmap uid={uid} timezone={tz} />
          </div>
          <div className="xl:col-span-7">
            <VolumeByMuscle uid={uid} unitSystem={units} />
          </div>
        </div>
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
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3.5">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-200">
          {title}
        </h2>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
          >
            {actionLabel}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
