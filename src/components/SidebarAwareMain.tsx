"use client";

import { useSidebar } from "@/lib/ui/sidebar-state";
import clsx from "clsx";
import type { ReactNode } from "react";

export default function SidebarAwareMain({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <main
      className={clsx(
        // Mobile: full width, bottom padding to clear fixed tab bar + iOS inset
        "w-full flex-1 px-4 pt-6",
        "pb-[calc(env(safe-area-inset-bottom)+5rem)]",
        // Desktop: shift right to clear sidebar, restore bottom padding
        collapsed ? "md:ml-16" : "md:ml-56",
        "md:pb-12 md:pt-8 md:px-8",
        // No max-w on the outer element — inner div handles that
      )}
    >
      <div className="mx-auto w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl">
        {children}
      </div>
    </main>
  );
}
