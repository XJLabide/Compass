"use client";

import DemoPreview from "./DemoPreview";

/**
 * Hero half of the login card on lg+ viewports. Headline at the top,
 * synthetic animated mini-dashboard preview underneath. No brand mark or
 * extra chrome — the form half already carries the brand.
 */
export default function LoginHero() {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden flex-col justify-center gap-5 overflow-hidden bg-black/55 p-7 lg:flex"
    >
      <h2 className="text-[30px] font-semibold leading-[1.1] tracking-tight text-neutral-50 drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)] xl:text-[34px]">
        Track your day.
        <br />
        <span className="text-cyan-300">Build your week.</span>
        <br />
        Compound for life.
      </h2>

      <DemoPreview />
    </aside>
  );
}
