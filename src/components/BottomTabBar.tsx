"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Home,
  Dumbbell,
  CheckSquare,
  Wallet,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

type Tab = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

// Bottom tab bar keeps the 4 most-used routes + a "More" entry that links to
// the settings page (where History / Check-in / Settings live, accessible via
// scrolling). We deliberately limit to 5 cells for thumb reach.
const TABS: Tab[] = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/todos", label: "Todos", Icon: CheckSquare },
  { href: "/money", label: "Money", Icon: Wallet },
  { href: "/workout", label: "Workout", Icon: Dumbbell },
  { href: "/settings", label: "More", Icon: MoreHorizontal },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  // The "More" tab is active whenever the user is in settings / history / check-in.
  if (href === "/settings") {
    return (
      pathname === "/settings" ||
      pathname.startsWith("/settings/") ||
      pathname === "/history" ||
      pathname.startsWith("/history/") ||
      pathname === "/check-in" ||
      pathname.startsWith("/check-in/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Mobile-only bottom tab bar. Desktop navigation is handled by Sidebar.
export default function BottomTabBar() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-panel/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex h-14 min-w-11 flex-col items-center justify-center gap-0.5 text-xs transition-colors",
                  active
                    ? "text-accent"
                    : "text-muted hover:text-neutral-200"
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={clsx("h-5 w-5", active && "stroke-[2.25]")}
                />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
