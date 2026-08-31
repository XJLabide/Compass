"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Activity,
  Home,
  Sun,
  Settings,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  CalendarDays,
  KanbanSquare,
  Target,
  Sparkles,
  Wallet,
  Flame,
  type LucideIcon,
} from "lucide-react";
import { useSidebar } from "@/lib/ui/sidebar-state";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", Icon: Sun },
  { href: "/", label: "Home", Icon: Home },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/projects", label: "Projects", Icon: KanbanSquare },
  { href: "/goals", label: "Goals", Icon: Target },
];

const TRACKING_ITEMS: NavItem[] = [
  { href: "/nutrition", label: "Nutrition", Icon: Flame },
  { href: "/fitness", label: "Fitness", Icon: Activity },
  { href: "/todos", label: "Todos", Icon: CheckSquare },
  { href: "/money", label: "Finances", Icon: Wallet },
];

const UTILITY_ITEMS: NavItem[] = [
  { href: "/nori", label: "Nori", Icon: Sparkles },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/fitness") {
    return pathname === "/fitness" || pathname.startsWith("/fitness/") || pathname === "/workout" || pathname.startsWith("/workout/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  Icon,
  collapsed,
  active,
}: NavItem & {
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={clsx(
        "ui-pressable group relative grid h-10 grid-cols-[2.5rem_minmax(0,1fr)] items-center rounded-md text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        active
          ? "bg-neutral-800/70 text-neutral-100"
          : "text-muted hover:bg-neutral-900 hover:text-neutral-100",
      )}
    >
      <Icon
        aria-hidden="true"
        className={clsx(
          "mx-auto h-[18px] w-[18px] shrink-0 transition-colors duration-150",
          active ? "text-accent" : "text-muted group-hover:text-neutral-200",
        )}
      />
      <span
        aria-hidden={collapsed}
        className={clsx(
          "min-w-0 overflow-hidden whitespace-nowrap font-medium leading-none",
          "transition-[max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          collapsed
            ? "max-w-0 -translate-x-1 opacity-0"
            : "max-w-40 translate-x-0 opacity-100",
        )}
      >
        {label}
      </span>

      {collapsed && (
        <span
          className={clsx(
            "pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md",
            "border border-border bg-neutral-900 px-2 py-1.5 text-xs font-medium text-neutral-100 shadow-lg",
            "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          {label}
        </span>
      )}
    </Link>
  );
}

function NavSection({
  items,
  collapsed,
  pathname,
}: {
  items: NavItem[];
  collapsed: boolean;
  pathname: string;
}) {
  return (
    <div className="space-y-1">
      {items.map(({ href, label, Icon }) => (
        <NavLink
          key={href}
          href={href}
          label={label}
          Icon={Icon}
          collapsed={collapsed}
          active={isActive(pathname, href)}
        />
      ))}
    </div>
  );
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
        "fixed left-0 top-0 z-40 h-dvh flex-col",
        "overflow-visible border-r border-border bg-panel",
        "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none",
        collapsed ? "w-[4.5rem]" : "w-60",
      )}
    >
      {/* Brand mark */}
      <div
        className={clsx(
          "grid h-14 shrink-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center border-b border-border px-2",
          "transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        )}
      >
        <Image
          src="/logo.png"
          alt="Compass"
          width={48}
          height={32}
          priority
          unoptimized
          className="mx-auto h-8 w-12 shrink-0 object-contain"
        />
        <span
          aria-hidden={collapsed}
          className={clsx(
            "min-w-0 select-none overflow-hidden whitespace-nowrap text-base font-semibold tracking-tight text-neutral-100",
            "transition-[max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            collapsed
              ? "max-w-0 -translate-x-1 opacity-0"
              : "max-w-32 translate-x-0 opacity-100",
          )}
        >
          Compass
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
        <div className="space-y-3">
          <NavSection items={NAV_ITEMS} collapsed={collapsed} pathname={pathname} />
          <div className="mx-2 border-t border-border/70" />
          <NavSection items={TRACKING_ITEMS} collapsed={collapsed} pathname={pathname} />
        </div>

        <div className="mt-auto space-y-3 pt-3">
          <div className="mx-2 border-t border-border/70" />
          <NavSection items={UTILITY_ITEMS} collapsed={collapsed} pathname={pathname} />
        </div>
      </nav>

      {/* Spacer + collapse toggle */}
      <div className="shrink-0 border-t border-border p-2">
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={clsx(
            "ui-pressable grid h-10 w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center rounded-md text-muted",
            "hover:bg-neutral-900 hover:text-neutral-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
          )}
        >
          {collapsed ? (
            <ChevronRight aria-hidden="true" className="mx-auto h-4 w-4 shrink-0" />
          ) : (
            <ChevronLeft aria-hidden="true" className="mx-auto h-4 w-4 shrink-0" />
          )}
          <span
            aria-hidden={collapsed}
            className={clsx(
              "min-w-0 overflow-hidden whitespace-nowrap text-sm font-medium leading-none",
              "transition-[max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
              collapsed
                ? "max-w-0 -translate-x-1 opacity-0"
                : "max-w-24 translate-x-0 opacity-100",
            )}
          >
            Collapse
          </span>
        </button>
      </div>
    </aside>
  );
}
