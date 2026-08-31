import type { ProjectColumn, ProjectDoc, TodoDoc } from "@/lib/db/types";

export const DEFAULT_PROJECT_COLUMNS: ProjectColumn[] = [
  { id: "backlog", name: "Backlog", order: 0 },
  { id: "todo", name: "Todo", order: 1 },
  { id: "doing", name: "Doing", order: 2 },
  { id: "done", name: "Done", order: 3 },
];

export function orderedColumns(project: ProjectDoc): ProjectColumn[] {
  return [...project.columns].sort((a, b) => a.order - b.order);
}

export function defaultColumnId(project: ProjectDoc): string {
  return orderedColumns(project)[0]?.id ?? DEFAULT_PROJECT_COLUMNS[0].id;
}

export function completedColumnId(project: ProjectDoc): string {
  const columns = orderedColumns(project);
  return (
    columns.find((column) => column.name.toLowerCase() === "done")?.id ??
    columns[columns.length - 1]?.id ??
    DEFAULT_PROJECT_COLUMNS[DEFAULT_PROJECT_COLUMNS.length - 1].id
  );
}

export function nextProjectOrder(todos: Array<{ data: TodoDoc }>): number {
  const currentMax = todos.reduce((max, row) => {
    const value = row.data.projectOrder;
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(max, value)
      : max;
  }, 0);
  return currentMax + 1000;
}

export function orderBetween(
  previous?: number,
  next?: number,
): number {
  if (typeof previous === "number" && typeof next === "number") {
    return (previous + next) / 2;
  }
  if (typeof previous === "number") return previous + 1000;
  if (typeof next === "number") return next / 2;
  return 1000;
}

export function makeColumnId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${slug || "column"}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sortProjectTodos<T extends { data: TodoDoc }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const left = a.data.projectOrder ?? 0;
    const right = b.data.projectOrder ?? 0;
    if (left !== right) return left - right;
    return a.data.title.localeCompare(b.data.title);
  });
}
