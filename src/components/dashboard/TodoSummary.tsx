"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ListTodo,
} from "lucide-react";

import { todoPath, todosPath } from "@/lib/db/paths";
import type { TodoDoc } from "@/lib/db/types";
import Skeleton from "@/components/ui/Skeleton";

export interface TodoSummaryProps {
  uid: string;
}

type Row = { id: string; data: TodoDoc };

/** Top 3 open todos. Single tap toggles done; full list lives at /todos. */
export default function TodoSummary({ uid }: TodoSummaryProps) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      todosPath(uid),
      where("done", "==", false),
      orderBy("createdAt", "desc"),
      limit(3),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
      () => setRows([]),
    );
    return () => unsub();
  }, [uid]);

  const toggle = useCallback(
    async (row: Row) => {
      try {
        await updateDoc(todoPath(uid, row.id), {
          done: true,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        /* swallow — full /todos handles error states */
      }
    },
    [uid],
  );

  const content = useMemo(() => {
    if (rows === null) {
      return (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="mt-3 rounded-lg border border-dashed border-border bg-neutral-900/30 px-3 py-4 text-center">
          <p className="text-xs font-medium text-neutral-100">
            All clear ✓
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Nothing on your list. Add one in /todos.
          </p>
        </div>
      );
    }
    return (
      <ul className="mt-3 space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-800/40"
          >
            <button
              type="button"
              onClick={() => toggle(row)}
              aria-label="Mark as done"
              className="shrink-0"
            >
              {row.data.done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <Circle className="h-4 w-4 text-muted group-hover:text-neutral-200" />
              )}
            </button>
            <span className="flex-1 truncate text-sm text-neutral-100">
              {row.data.title}
            </span>
          </li>
        ))}
      </ul>
    );
  }, [rows, toggle]);

  return (
    <section
      aria-labelledby="todo-summary-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <ListTodo aria-hidden className="h-4 w-4 text-accent" />
          <h2
            id="todo-summary-heading"
            className="text-xs font-medium uppercase tracking-wide text-muted"
          >
            Todos
          </h2>
        </div>
        <Link
          href="/todos"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {content}
    </section>
  );
}
