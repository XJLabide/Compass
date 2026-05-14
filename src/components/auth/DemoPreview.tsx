"use client";

import {
  CheckCircle2,
  Dumbbell,
  Flame,
  TrendingUp,
  Wallet,
} from "lucide-react";

/**
 * Synthetic mini-dashboard "video" — pure CSS animation that mimics a screen
 * recording of Compass without any real video asset. Loops on a slow timeline
 * via keyframes defined in globals.css.
 *
 * Layout: a stylized "device" frame containing a few miniature Compass widgets
 * (Today, Streak, Money, Todos). Each widget animates on its own offset so the
 * whole thing feels alive — numbers tick up, a checkbox flips, a bar grows.
 */
export default function DemoPreview() {
  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur"
    >
      {/* Fake macOS-style window chrome */}
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="ml-auto text-[8px] uppercase tracking-[0.2em] text-muted">
          compass · home
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Today */}
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2.5">
          <div className="flex items-center gap-1.5">
            <Dumbbell className="h-3 w-3 text-cyan-300" />
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted">
              Today
            </span>
          </div>
          <div className="mt-1.5 text-[11px] font-semibold text-neutral-100">
            Upper A
          </div>
          <div className="text-[9px] text-muted">5 exercises · 4 sets each</div>
        </div>

        {/* Streak */}
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2.5">
          <div className="flex items-center gap-1.5">
            <Flame className="h-3 w-3 text-amber-400" />
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted">
              Streak
            </span>
          </div>
          <div className="mt-1.5 text-[15px] font-semibold text-neutral-100 tabular-nums">
            <span className="demo-streak">14</span>
            <span className="ml-1 text-[9px] text-muted">days</span>
          </div>
        </div>

        {/* Money */}
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2.5">
          <div className="flex items-center gap-1.5">
            <Wallet className="h-3 w-3 text-emerald-300" />
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted">
              Net · May
            </span>
          </div>
          <div className="mt-1.5 text-[12px] font-semibold text-emerald-300 tabular-nums">
            +$<span className="demo-net">432</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="demo-money-bar h-full bg-emerald-400/70" />
          </div>
        </div>

        {/* Volume trend */}
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-cyan-300" />
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted">
              Volume / wk
            </span>
          </div>
          <svg
            viewBox="0 0 80 24"
            className="mt-1 h-6 w-full"
            preserveAspectRatio="none"
          >
            <polyline
              className="demo-spark"
              points="0,18 12,16 24,17 36,12 48,9 60,11 72,5 80,3"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Todos */}
        <div className="col-span-2 rounded-md border border-white/10 bg-white/[0.04] p-2.5">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-cyan-300" />
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted">
              Todos · today
            </span>
          </div>
          <ul className="mt-1.5 space-y-1">
            <li className="demo-todo demo-todo--done flex items-center gap-1.5 text-[10px]">
              <span className="demo-check h-3 w-3 shrink-0 rounded-full border border-emerald-400/60 bg-emerald-400/20" />
              <span className="demo-text">Morning walk</span>
            </li>
            <li className="flex items-center gap-1.5 text-[10px]">
              <span className="h-3 w-3 shrink-0 rounded-full border border-white/20" />
              <span className="text-neutral-100">Log workout</span>
            </li>
            <li className="flex items-center gap-1.5 text-[10px]">
              <span className="h-3 w-3 shrink-0 rounded-full border border-white/20" />
              <span className="text-neutral-100">Daily check-in</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
