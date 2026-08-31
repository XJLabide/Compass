"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowRight, KanbanSquare } from "lucide-react";

import { projectsPath, todosPath } from "@/lib/db/paths";
import type { ProjectDoc, TodoDoc } from "@/lib/db/types";
import Skeleton from "@/components/ui/Skeleton";

export interface ProjectSummaryProps {
  uid: string;
}

type ProjectRow = { id: string; data: ProjectDoc };
type TodoRow = { id: string; data: TodoDoc };

export default function ProjectSummary({ uid }: ProjectSummaryProps) {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [todos, setTodos] = useState<TodoRow[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(projectsPath(uid), orderBy("createdAt", "desc")),
      (snap) =>
        setProjects(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
      () => setProjects([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(todosPath(uid), orderBy("createdAt", "desc")),
      (snap) => setTodos(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
      () => setTodos([]),
    );
    return () => unsub();
  }, [uid]);

  const summary = useMemo(() => {
    const activeProjects = (projects ?? []).filter((p) => !p.data.archived);
    const projectIds = new Set(activeProjects.map((p) => p.id));
    const projectTodos = (todos ?? []).filter(
      (todo) => todo.data.projectId && projectIds.has(todo.data.projectId),
    );
    const completedCards = projectTodos.filter((todo) => todo.data.done).length;
    const openCards = projectTodos.length - completedCards;
    const progressPercent =
      projectTodos.length > 0
        ? Math.round((completedCards / projectTodos.length) * 100)
        : 0;

    const byProject = activeProjects
      .map((project) => {
        const cards = projectTodos.filter(
          (todo) => todo.data.projectId === project.id,
        );
        const done = cards.filter((todo) => todo.data.done).length;
        return {
          id: project.id,
          name: project.data.name,
          open: cards.length - done,
          progress:
            cards.length > 0 ? Math.round((done / cards.length) * 100) : 0,
        };
      })
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
      .slice(0, 3);

    return {
      activeProjects: activeProjects.length,
      openCards,
      completedCards,
      progressPercent,
      byProject,
    };
  }, [projects, todos]);

  const loading = projects === null || todos === null;

  return (
    <section
      aria-labelledby="project-summary-heading"
      className="rounded-lg border border-border bg-panel p-4"
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <KanbanSquare aria-hidden className="h-4 w-4 text-accent" />
          <h2
            id="project-summary-heading"
            className="text-sm font-semibold text-neutral-200"
          >
            Projects
          </h2>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-4/5" />
        </div>
      ) : summary.activeProjects === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-border bg-neutral-900/30 px-3 py-4 text-center">
          <p className="text-xs font-medium text-neutral-100">
            No active projects
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Create one from Projects.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-md border border-border/70 bg-neutral-950/30">
            <Metric label="Active" value={summary.activeProjects} />
            <Metric label="Open" value={summary.openCards} />
            <Metric label="Done" value={summary.completedCards} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-neutral-800/80">
              <div
                className="h-full bg-accent/70 transition-[width] duration-300"
                style={{ width: `${summary.progressPercent}%` }}
              />
            </div>
            <span className="w-9 text-right text-[11px] text-muted tabular-nums">
              {summary.progressPercent}%
            </span>
          </div>
          {summary.byProject.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {summary.byProject.map((project) => (
                <li
                  key={project.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-neutral-200">
                    {project.name}
                  </span>
                  <span className="shrink-0 text-muted">
                    {project.open} open
                  </span>
                  <span className="w-8 shrink-0 text-right text-muted tabular-nums">
                    {project.progress}%
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2.5 py-2">
      <div className="text-base font-semibold text-neutral-100 tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-muted">{label}</div>
    </div>
  );
}
