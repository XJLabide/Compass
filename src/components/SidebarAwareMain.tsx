"use client";

import { useSidebar } from "@/lib/ui/sidebar-state";
import clsx from "clsx";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname() ?? "/";
  const fullWidth = pathname === "/projects" || pathname.startsWith("/projects/");

  return (
    <main
      className={clsx(
        // Mobile: full width, bottom padding to clear fixed tab bar + iOS inset
        "min-h-dvh w-full min-w-0 flex-1 bg-bg px-3 pt-[max(3.5rem,calc(env(safe-area-inset-top)+0.875rem))]",
        "pb-[calc(env(safe-area-inset-bottom)+5rem)]",
        // Desktop: shift right to clear sidebar AND subtract its width so we
        // don't overflow horizontally.
        collapsed
          ? "md:ml-[4.5rem] md:w-[calc(100%-4.5rem)]"
          : "md:ml-60 md:w-[calc(100%-15rem)]",
        fullWidth
          ? "md:h-dvh md:overflow-hidden md:px-4 md:pb-4 md:pt-4 lg:px-5"
          : "md:pb-12 md:px-6 md:pt-7 lg:px-8",
        // No max-w on the outer element — inner div handles that
      )}
    >
      <div
        className={clsx(
          "mx-auto w-full min-w-0",
          fullWidth ? "max-w-none md:h-full md:min-h-0" : "max-w-7xl",
        )}
      >
        {children}
      </div>
    </main>
  );
}
