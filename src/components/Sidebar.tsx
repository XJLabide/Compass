"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Dumbbell,
  Home,
  ClipboardCheck,
  LineChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useSidebar } from "@/lib/ui/sidebar-state";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/todos", label: "Todos", Icon: CheckSquare },
  { href: "/money", label: "Money", Icon: Wallet },
  { href: "/workout", label: "Workout", Icon: Dumbbell },
  { href: "/check-in", label: "Check-in", Icon: ClipboardCheck },
  { href: "/history", label: "History", Icon: LineChart },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname() ?? "/";

  return (
    <aside
      aria-label="Primary navigation"
      className={clsx(
        // Hidden on mobile — only shown md+
        "hidden md:flex",
        "fixed left-0 top-0 z-40 h-screen flex-col",
        "border-r border-border bg-panel",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Brand mark */}
      <div
        className={clsx(
          "flex h-16 shrink-0 items-center border-b border-border px-3",
          collapsed ? "justify-center" : "gap-2.5 px-4"
        )}
      >
        <Image
          src="/logo-mark.svg"
          alt="Compass"
          width={36}
          height={36}
          priority
          unoptimized
          className="h-9 w-9 shrink-0"
        />
        {!collapsed && (
          <span className="select-none text-base font-semibold tracking-tight text-neutral-100">
            Compass
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map(({ href, label, Icon }, idx) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={`${href}-${idx}`}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={clsx(
                "group relative flex h-11 items-center rounded-md transition-colors",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                active
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:bg-panel2 hover:text-neutral-100"
              )}
            >
              <Icon
                aria-hidden="true"
                className={clsx(
                  "h-[18px] w-[18px] shrink-0",
                  active && "stroke-[2.25]"
                )}
              />
              {!collapsed && (
                <span className="text-[13px] font-medium leading-none tracking-wide">
                  {label}
                </span>
              )}

              {/* Tooltip on collapsed */}
              {collapsed && (
                <span
                  className={clsx(
                    "pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md",
                    "bg-panel2 px-2.5 py-1.5 text-xs font-medium text-neutral-100 shadow-lg",
                    "border border-border",
                    "opacity-0 transition-opacity group-hover:opacity-100"
                  )}
                >
                  {label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Spacer + collapse toggle */}
      <div className="shrink-0 border-t border-border p-2">
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={clsx(
            "flex h-11 w-full items-center rounded-md text-muted",
            "transition-colors hover:bg-panel2 hover:text-neutral-100",
            collapsed ? "justify-center" : "gap-3 px-3"
          )}
        >
          {collapsed ? (
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="text-[13px] font-medium leading-none tracking-wide">
                Collapse
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
