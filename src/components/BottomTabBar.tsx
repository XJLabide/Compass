"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Home,
  Dumbbell,
  ClipboardCheck,
  LineChart,
  Settings,
  type LucideIcon,
} from "lucide-react";

type Tab = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

const TABS: Tab[] = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/workout", label: "Workout", Icon: Dumbbell },
  { href: "/check-in", label: "Check-in", Icon: ClipboardCheck },
  { href: "/history", label: "History", Icon: LineChart },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
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
