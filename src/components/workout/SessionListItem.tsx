import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";

import type { SessionDoc } from "@/lib/db/types";

/**
 * Single row in the "Recent sessions" list on `/workout`.
 *
 * Renders the session name, the localDate, set count, and an in-progress
 * indicator. The whole row is a link to `/workout/[id]` (read-only or live
 * logger depending on status — that's the page's call).
 */
export default function SessionListItem({
  id,
  session,
}: {
  id: string;
  session: SessionDoc;
}) {
  const inProgress = session.status === "in_progress";
  const setCount = Array.isArray(session.sets) ? session.sets.length : 0;

  return (
    <li>
      <Link
        href={`/workout/${id}`}
        className="flex min-h-[3.5rem] items-center justify-between gap-3 rounded-lg border border-border bg-neutral-900/40 px-3 py-2 text-left transition hover:bg-neutral-800/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-neutral-100">
              {session.name || "Session"}
            </p>
            {inProgress ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                In progress
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {session.localDate}
            <span aria-hidden="true"> · </span>
            {setCount} {setCount === 1 ? "set" : "sets"}
          </p>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted"
        />
      </Link>
    </li>
  );
}
