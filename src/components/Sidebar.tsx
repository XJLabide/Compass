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
        "group relative flex h-10 items-center rounded-md text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active
          ? "bg-neutral-800/70 text-neutral-100"
          : "text-muted hover:bg-neutral-900 hover:text-neutral-100",
      )}
    >
      <Icon
        aria-hidden="true"
        className={clsx(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active ? "text-accent" : "text-muted group-hover:text-neutral-200",
        )}
      />
      {!collapsed && (
        <span className="min-w-0 truncate font-medium leading-none">
          {label}
        </span>
      )}

      {collapsed && (
        <span
          className={clsx(
            "pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md",
            "border border-border bg-neutral-900 px-2 py-1.5 text-xs font-medium text-neutral-100 shadow-lg",
            "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
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
        "border-r border-border bg-panel",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-[4.5rem]" : "w-60",
      )}
    >
      {/* Brand mark */}
      <div
        className={clsx(
          "flex h-14 shrink-0 items-center border-b border-border px-3",
          collapsed ? "justify-center" : "gap-2.5 px-4",
        )}
      >
        <Image
          src="/logo.png"
          alt="Compass"
          width={48}
          height={32}
          priority
          unoptimized
          className="h-8 w-12 shrink-0 object-contain"
        />
        {!collapsed && (
          <span className="select-none text-base font-semibold tracking-tight text-neutral-100">
            Compass
          </span>
        )}
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
            "flex h-10 w-full items-center rounded-md text-muted",
            "transition-colors hover:bg-neutral-900 hover:text-neutral-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
            collapsed ? "justify-center" : "gap-3 px-3",
          )}
        >
          {collapsed ? (
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium leading-none">
                Collapse
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
