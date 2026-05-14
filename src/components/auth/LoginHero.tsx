"use client";

import Image from "next/image";

/**
 * Hero half of the login card on lg+ viewports. Shares the parent card's
 * outer border and rounded corners — no border or radius of its own.
 *
 * Uses a slightly darker surface than the form half to create the inner
 * contrast that the reference template uses (form left = lighter, hero right
 * = pure black).
 */
export default function LoginHero() {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden flex-col justify-between overflow-hidden bg-black/55 p-7 lg:flex"
    >
      <div className="flex items-center gap-2.5">
        <Image
          src="/logo-mark.svg"
          alt=""
          width={24}
          height={24}
          priority
          unoptimized
          className="h-6 w-6 drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]"
        />
        <span className="text-[13px] font-semibold tracking-tight text-neutral-100">
          Compass
        </span>
      </div>

      <div className="space-y-3">
        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-cyan-200">
          Personal dashboard
        </span>
        <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-50 drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)]">
          Track your day.
          <br />
          <span className="text-cyan-300">Build your week.</span>
          <br />
          Compound for life.
        </h2>
        <p className="text-[11px] leading-relaxed text-neutral-300">
          Workouts, daily check-ins, todos, and money — one place.
        </p>

        <ul className="grid grid-cols-2 gap-1.5 pt-1">
          <FeaturePill label="Workouts & PRs" />
          <FeaturePill label="Daily check-ins" />
          <FeaturePill label="Todos" />
          <FeaturePill label="Money tracker" />
        </ul>
      </div>
    </aside>
  );
}

function FeaturePill({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-neutral-100">
      <span aria-hidden className="h-1 w-1 rounded-full bg-cyan-300" />
      {label}
    </li>
  );
}
