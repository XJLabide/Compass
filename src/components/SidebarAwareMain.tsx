"use client";

import { useSidebar } from "@/lib/ui/sidebar-state";
import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Main content wrapper that respects the fixed sidebar's width.
 *
 * The sidebar is `position: fixed` so it's out of normal flow. If we leave the
 * main at `w-full` and only push it right with `ml-{N}`, the main extends
 * `viewport + sidebarWidth` and produces horizontal scroll. To prevent that,
 * width is `calc(100% - sidebarWidth)` on md+ so the rightmost edge of main
 * lands at the viewport's right edge.
 *
 * Mobile (<md): sidebar is hidden, so full width is correct.
 */
export default function SidebarAwareMain({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <main
      className={clsx(
        // Mobile: full width, bottom padding to clear fixed tab bar + iOS inset
        "w-full min-w-0 flex-1 px-4 pt-6",
        "pb-[calc(env(safe-area-inset-bottom)+5rem)]",
        // Desktop: shift right to clear sidebar AND subtract its width so we
        // don't overflow horizontally.
        collapsed
          ? "md:ml-16 md:w-[calc(100%-4rem)]"
          : "md:ml-56 md:w-[calc(100%-14rem)]",
        "md:pb-12 md:pt-8 md:px-8",
        // No max-w on the outer element — inner div handles that
      )}
    >
      <div className="mx-auto w-full min-w-0 max-w-3xl lg:max-w-5xl xl:max-w-6xl">
        {children}
      </div>
    </main>
  );
}
