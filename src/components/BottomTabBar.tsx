"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Home,
  Dumbbell,
  CheckSquare,
  Wallet,
  MoreHorizontal,
  ClipboardCheck,
  LineChart,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";

type Tab = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

/**
 * Mobile bottom tab bar. The first four cells navigate to primary routes via
 * <Link>. The fifth cell ("More") is a button that opens a bottom-sheet
 * listing secondary routes (Check-in, History, Settings) — so the user gets a
 * real "more" hub instead of being jumped straight to settings.
 */
const PRIMARY_TABS: Tab[] = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/todos", label: "Todos", Icon: CheckSquare },
  { href: "/money", label: "Money", Icon: Wallet },
  { href: "/workout", label: "Workout", Icon: Dumbbell },
];

const SECONDARY_LINKS: Tab[] = [
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

function isInMoreSection(pathname: string): boolean {
  return SECONDARY_LINKS.some((s) => isActive(pathname, s.href));
}

export default function BottomTabBar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet on route change (covers cases other than the explicit
  // link clicks, e.g. browser back).
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Esc closes the sheet
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const moreActive = isInMoreSection(pathname);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-panel/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around">
          {PRIMARY_TABS.map(({ href, label, Icon }) => {
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
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className={clsx(
                "flex h-14 w-full min-w-11 flex-col items-center justify-center gap-0.5 text-xs transition-colors",
                moreActive || moreOpen
                  ? "text-accent"
                  : "text-muted hover:text-neutral-200",
              )}
            >
              <MoreHorizontal
                aria-hidden="true"
                className={clsx(
                  "h-5 w-5",
                  (moreActive || moreOpen) && "stroke-[2.25]",
                )}
              />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen ? (
        <MoreSheet
          pathname={pathname}
          onClose={() => setMoreOpen(false)}
          onPick={(href) => {
            router.push(href);
            setMoreOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function MoreSheet({
  pathname,
  onClose,
  onPick,
}: {
  pathname: string;
  onClose: () => void;
  onPick: (href: string) => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="More navigation"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur md:hidden"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            More
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="p-2">
          {SECONDARY_LINKS.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <button
                  type="button"
                  onClick={() => onPick(href)}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-neutral-100 hover:bg-neutral-800/60",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
