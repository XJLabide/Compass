"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import {
  addDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  KanbanSquare,
} from "lucide-react";

import { todoPath, todosPath } from "@/lib/db/paths";
import type { ProjectDoc, TodoDoc } from "@/lib/db/types";
import CompassLoader from "@/components/ui/CompassLoader";

type TodoRow = { id: string; data: TodoDoc };
type ProjectRow = { id: string; data: ProjectDoc };

export interface ProjectFocusSectionProps {
  uid: string;
  activeDate: string;
  todos: TodoRow[] | null;
  projects: ProjectRow[] | null;
}

function addDaysIso(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function defaultColumnId(project: ProjectDoc): string {
  return (
    [...project.columns].sort((a, b) => a.order - b.order)[0]?.id ??
    "backlog"
  );
}

function doneColumnId(project: ProjectDoc): string {
  const columns = [...project.columns].sort((a, b) => a.order - b.order);
  return (
    columns.find((column) => /done|complete|closed/i.test(column.name))?.id ??
    columns[columns.length - 1]?.id ??
    defaultColumnId(project)
  );
}

export default function ProjectFocusSection({
  uid,
  activeDate,
  todos,
  projects,
}: ProjectFocusSectionProps) {
  const loaded = todos !== null && projects !== null;

  const projectMap = useMemo(() => {
    const map = new Map<string, ProjectRow>();
    for (const project of projects ?? []) {
      if (!project.data.archived) map.set(project.id, project);
    }
    return map;
  }, [projects]);

  const rows = useMemo(() => {
    if (!loaded) return [];
    return (todos ?? [])
      .filter((row) => {
        const projectId = row.data.projectId;
        return (
          !row.data.done &&
          Boolean(projectId) &&
          Boolean(row.data.dueDate) &&
          row.data.dueDate! <= activeDate &&
          Boolean(projectId && projectMap.has(projectId))
        );
      })
      .sort((a, b) => {
        const dateCompare = (a.data.dueDate ?? "").localeCompare(
          b.data.dueDate ?? "",
        );
        if (dateCompare !== 0) return dateCompare;
        return a.data.title.localeCompare(b.data.title);
      });
  }, [activeDate, loaded, projectMap, todos]);

  const complete = useCallback(
    async (row: TodoRow) => {
      const project = row.data.projectId
        ? projectMap.get(row.data.projectId)
        : undefined;
      if (!project) return;

      const nextDoneColumn = doneColumnId(project.data);
      await updateDoc(todoPath(uid, row.id), {
        done: true,
        completedAt: serverTimestamp(),
        projectColumnId: nextDoneColumn,
        projectCompletedColumnId: nextDoneColumn,
        updatedAt: serverTimestamp(),
      });

      if (row.data.recurrence && row.data.recurrence !== "none") {
        const delta = row.data.recurrence === "daily" ? 1 : 7;
        const nextColumn =
          row.data.projectColumnId ?? defaultColumnId(project.data);
        const payload: Record<string, unknown> = {
          title: row.data.title,
          done: false,
          dueDate: addDaysIso(row.data.dueDate ?? activeDate, delta),
          recurrence: row.data.recurrence,
          projectId: project.id,
          projectColumnId: nextColumn,
          projectOrder: Date.now(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (row.data.note) payload.note = row.data.note;
        if (row.data.priority) payload.priority = row.data.priority;
        await addDoc(todosPath(uid), payload as unknown as TodoDoc);
      }
    },
    [activeDate, projectMap, uid],
  );

  if (!loaded) {
    return <CompassLoader mode="card" size="md" label="Loading Projects..." />;
  }

  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KanbanSquare className="h-4 w-4 text-accent" />
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            Projects
          </h2>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
        >
          Open <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted">
          No project work due through today.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border/70 bg-neutral-950/30 px-3 py-2">
            <div>
              <div className="text-lg font-semibold text-neutral-100 tabular-nums">
                {rows.length}
              </div>
              <div className="text-[10px] text-muted">
                Project card{rows.length === 1 ? "" : "s"} due
              </div>
            </div>
            <Link
              href="/projects"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-neutral-900 px-2.5 text-[10px] font-medium text-neutral-200 hover:border-neutral-600"
            >
              Board <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="mt-3 space-y-1.5">
            {rows.slice(0, 6).map((row) => {
              const project = row.data.projectId
                ? projectMap.get(row.data.projectId)
                : undefined;
              const overdue = Boolean(
                row.data.dueDate && row.data.dueDate < activeDate,
              );
              const column = project?.data.columns.find(
                (item) => item.id === row.data.projectColumnId,
              );
              return (
                <li key={row.id}>
                  <div className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-neutral-800/40">
                    <button
                      type="button"
                      onClick={() => void complete(row)}
                      aria-label={`Complete ${row.data.title}`}
                      className="shrink-0"
                    >
                      {row.data.done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted transition-colors group-hover:text-neutral-200" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-neutral-100">
                        {row.data.title}
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-muted">
                        <span className="truncate">
                          {project?.data.name ?? "Project"}
                        </span>
                        {column ? <span className="shrink-0">/</span> : null}
                        {column ? (
                          <span className="truncate">{column.name}</span>
                        ) : null}
                      </div>
                    </div>
                    {overdue && row.data.dueDate ? (
                      <span className="shrink-0 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-300">
                        {row.data.dueDate}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length > 6 ? (
            <p className="mt-2 text-[10px] text-muted">
              {rows.length - 6} more in Projects.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
