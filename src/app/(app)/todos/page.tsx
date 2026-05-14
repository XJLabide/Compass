"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckSquare, Repeat } from "lucide-react";
import clsx from "clsx";

import TodosTab from "@/components/todos/TodosTab";
import RoutinesTab from "@/components/todos/RoutinesTab";

type Tab = "todos" | "routines";

const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "todos", label: "Todos", Icon: CheckSquare },
  { id: "routines", label: "Routines", Icon: Repeat },
];

/**
 * `/todos` — two-tab hub for one-shot tasks (Todos) and tracked habits
 * (Routines). Active tab is mirrored in the URL via `?tab=routines` so it's
 * bookmarkable and the browser back/forward buttons behave as expected.
 */
export default function TodosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("tab");
  const active: Tab = useMemo(
    () => (param === "routines" ? "routines" : "todos"),
    [param],
  );

  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "todos") params.delete("tab");
      else params.set("tab", next);
      const q = params.toString();
      router.replace(q ? `/todos?${q}` : "/todos");
    },
    [router, searchParams],
  );

  return (
    <section className="space-y-4">
      <header className="space-y-3 border-b border-border pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          {active === "todos" ? "Todos" : "Routines"}
        </h1>
        <div
          role="tablist"
          aria-label="Todos and routines"
          className="inline-flex rounded-lg border border-border bg-neutral-900/40 p-1"
        >
          {TABS.map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setTab(id)}
                className={clsx(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:text-neutral-200",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </header>

      {active === "todos" ? <TodosTab /> : <RoutinesTab />}
    </section>
  );
}
