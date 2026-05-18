"use client";

import NoriChat from "@/components/nori/NoriChat";

/**
 * `/nori` — full-page chat with Nori. Same component as the floating panel,
 * mounted inside the app shell so the sidebar/nav stays available.
 */
export default function NoriPage() {
  return (
    <section className="h-[calc(100dvh-7rem)] rounded-xl border border-border bg-neutral-900/40 md:h-[calc(100dvh-6rem)]">
      <NoriChat />
    </section>
  );
}
