"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clapperboard,
  Code2,
  ExternalLink,
  GripVertical,
  KanbanSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  addDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type UpdateData,
} from "firebase/firestore";

import { useActiveDay } from "@/lib/day/ActiveDayProvider";
import { useUserData } from "@/lib/data/UserDataProvider";
import { projectPath, projectsPath, todoPath, todosPath } from "@/lib/db/paths";
import type {
  LocalDate,
  ProjectColumn,
  ProjectContentPlatform,
  ProjectDoc,
  ProjectType,
  TodoDoc,
  TodoPriority,
  TodoRecurrence,
} from "@/lib/db/types";
import {
  DEFAULT_PROJECT_COLUMNS,
  completedColumnId,
  defaultColumnId,
  makeColumnId,
  nextProjectOrder,
  orderBetween,
  orderedColumns,
  sortProjectTodos,
} from "@/lib/projects/kanban";
import {
  GithubLogo,
  PlatformChip,
  PlatformLogo,
  TechStackChip,
  platformLabel,
  projectTypeLabel,
  repositoryLabel,
} from "@/components/projects/ProjectBranding";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";

type ProjectRow = { id: string; data: ProjectDoc };
type TodoRow = { id: string; data: TodoDoc };
type CardDraft = {
  title: string;
  note: string;
  dueDate: string;
  priority: TodoPriority | "none";
  recurrence: TodoRecurrence;
};
type ProjectDraft = {
  name: string;
  type: ProjectType;
  description: string;
  repositoryUrl: string;
  techStackInput: string;
  topic: string;
  contentPlatforms: ProjectContentPlatform[];
  columns: ProjectColumn[];
};
type ProjectStats = {
  totalCards: number;
  completedCards: number;
  openCards: number;
  progressPercent: number;
};
type ProjectMilestone = {
  id: string;
  title: string;
  dueDate?: LocalDate;
  priority?: TodoPriority;
};

const EMPTY_CARD: CardDraft = {
  title: "",
  note: "",
  dueDate: "",
  priority: "none",
  recurrence: "none",
};
const PROJECT_TYPE_FILTERS: Array<{ value: "all" | ProjectType; label: string }> = [
  { value: "all", label: "All" },
  { value: "dev", label: "Dev" },
  { value: "content", label: "Content" },
];
const CONTENT_PLATFORM_OPTIONS: ProjectContentPlatform[] = [
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "blog",
  "newsletter",
  "podcast",
];

function newProjectDraft(): ProjectDraft {
  return {
    name: "",
    type: "dev",
    description: "",
    repositoryUrl: "",
    techStackInput: "",
    topic: "",
    contentPlatforms: [],
    columns: DEFAULT_PROJECT_COLUMNS.map((column) => ({ ...column })),
  };
}

function addDaysIso(iso: string, delta: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + delta * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function formatDate(iso?: LocalDate): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function projectSort(a: ProjectRow, b: ProjectRow): number {
  if (a.data.archived !== b.data.archived) return a.data.archived ? 1 : -1;
  return a.data.name.localeCompare(b.data.name);
}

function writeError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function parseTechStack(input?: string): string[] {
  return (input ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function normalizedProjectType(project: ProjectDoc): ProjectType {
  return project.type === "content" ? "content" : "dev";
}

function nextMilestoneFromRows(rows: TodoRow[]): ProjectMilestone | null {
  const openRows = rows.filter((row) => !row.data.done);
  if (openRows.length === 0) return null;
  const withDueDate = openRows
    .filter((row) => row.data.dueDate)
    .sort((a, b) => {
      const byDate = a.data.dueDate!.localeCompare(b.data.dueDate!);
      if (byDate !== 0) return byDate;
      return a.data.title.localeCompare(b.data.title);
    });
  const priorityRank: Record<TodoPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  const fallback = [...openRows].sort((a, b) => {
    const aRank = a.data.priority ? priorityRank[a.data.priority] : 3;
    const bRank = b.data.priority ? priorityRank[b.data.priority] : 3;
    if (aRank !== bRank) return aRank - bRank;
    return a.data.title.localeCompare(b.data.title);
  });
  const row = withDueDate[0] ?? fallback[0];
  return {
    id: row.id,
    title: row.data.title,
    dueDate: row.data.dueDate,
    priority: row.data.priority,
  };
}

function statsFromRows(rows: TodoRow[]): ProjectStats {
  const totalCards = rows.length;
  const completedCards = rows.filter((row) => row.data.done).length;
  const openCards = totalCards - completedCards;
  return {
    totalCards,
    completedCards,
    openCards,
    progressPercent: totalCards ? Math.round((completedCards / totalCards) * 100) : 0,
  };
}

export default function ProjectsPage() {
  const { uid } = useUserData();
  const { activeDate: today, hasActiveDay } = useActiveDay();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [todos, setTodos] = useState<TodoRow[] | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(() => newProjectDraft());
  const [creatingProject, setCreatingProject] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string>("");
  const [newColumnName, setNewColumnName] = useState("");
  const [cardDraft, setCardDraft] = useState<CardDraft>(EMPTY_CARD);
  const [cardDetailsOpen, setCardDetailsOpen] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState("");
  const [editingCard, setEditingCard] = useState<TodoRow | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProjectRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(projectsPath(uid), orderBy("createdAt", "desc")),
      (snap) => {
        setProjects(snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })));
        setError(null);
      },
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(todosPath(uid), orderBy("createdAt", "desc")),
      (snap) => {
        setTodos(snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })));
      },
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [uid]);

  const visibleProjects = useMemo(
    () =>
      (projects ?? [])
        .filter((project) => !project.data.archived)
        .sort(projectSort),
    [projects],
  );
  const activeProject = useMemo(
    () => visibleProjects.find((project) => project.id === activeProjectId),
    [activeProjectId, visibleProjects],
  );
  const activeColumns = useMemo(
    () => (activeProject ? orderedColumns(activeProject.data) : []),
    [activeProject],
  );
  const projectTodos = useMemo(
    () =>
      sortProjectTodos(
        (todos ?? []).filter((row) => row.data.projectId === activeProjectId),
      ),
    [activeProjectId, todos],
  );
  const draggingCard = useMemo(
    () => projectTodos.find((row) => row.id === draggingCardId) ?? null,
    [draggingCardId, projectTodos],
  );
  const projectStats = useMemo(() => {
    const map = new Map<string, ProjectStats>();
    for (const project of visibleProjects) {
      map.set(
        project.id,
        statsFromRows((todos ?? []).filter((row) => row.data.projectId === project.id)),
      );
    }
    return map;
  }, [todos, visibleProjects]);
  const activeProjectStats = activeProject
    ? projectStats.get(activeProject.id) ?? statsFromRows([])
    : statsFromRows([]);

  useEffect(() => {
    if (!visibleProjects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId("");
    }
  }, [activeProjectId, visibleProjects]);

  useEffect(() => {
    if (!activeProject) return;
    const columns = orderedColumns(activeProject.data);
    if (!columns.some((column) => column.id === activeColumnId)) {
      setActiveColumnId(columns[0]?.id ?? "");
    }
    setEditingProjectName(activeProject.data.name);
  }, [activeColumnId, activeProject]);

  const todosByColumn = useMemo(() => {
    const map = new Map<string, TodoRow[]>();
    for (const column of activeColumns) map.set(column.id, []);
    for (const row of projectTodos) {
      const columnId =
        row.data.projectColumnId && map.has(row.data.projectColumnId)
          ? row.data.projectColumnId
          : activeColumns[0]?.id;
      if (columnId) map.get(columnId)?.push(row);
    }
    return map;
  }, [activeColumns, projectTodos]);

  const createProject = useCallback(async () => {
    if (!uid) return;
    const name = projectDraft.name.trim();
    const columns = projectDraft.columns
      .map((column, index) => ({
        ...column,
        name: column.name.trim(),
        order: index,
      }))
      .filter((column) => column.name);
    if (!name) {
      setCreateError("Enter a project name.");
      return;
    }
    if (!columns.length) {
      setCreateError("Keep at least one column.");
      return;
    }
    setCreatingProject(true);
    setCreateError(null);
    try {
      const payload: Record<string, unknown> = {
        name,
        type: projectDraft.type,
        columns,
        archived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const description = projectDraft.description.trim();
      const repositoryUrl = projectDraft.repositoryUrl.trim();
      const techStack = parseTechStack(projectDraft.techStackInput);
      const topic = projectDraft.topic.trim();
      if (description) payload.description = description;
      if (projectDraft.type === "content") {
        if (topic) payload.topic = topic;
        if (projectDraft.contentPlatforms.length) {
          payload.contentPlatforms = projectDraft.contentPlatforms;
        }
      } else {
        if (repositoryUrl) payload.repositoryUrl = repositoryUrl;
        if (techStack.length) payload.techStack = techStack;
      }
      const ref = await addDoc(projectsPath(uid), payload as unknown as ProjectDoc);
      setProjectDraft(newProjectDraft());
      setCreateOpen(false);
      setError(null);
      setActiveProjectId(ref.id);
      setActiveColumnId(columns[0].id);
    } catch (err) {
      setCreateError(writeError(err, "Failed to create project"));
    } finally {
      setCreatingProject(false);
    }
  }, [projectDraft, uid]);

  const saveProjectName = useCallback(async () => {
    if (!uid || !activeProject) return;
    const name = editingProjectName.trim();
    if (!name) return;
    try {
      await updateDoc(projectPath(uid, activeProject.id), {
        name,
        updatedAt: serverTimestamp(),
      });
      setError(null);
    } catch (err) {
      setError(writeError(err, "Failed to rename project"));
    }
  }, [activeProject, editingProjectName, uid]);

  const saveProjectType = useCallback(
    async (type: ProjectType) => {
      if (!uid || !activeProject) return;
      try {
        await updateDoc(projectPath(uid, activeProject.id), {
          type,
          updatedAt: serverTimestamp(),
        });
        setError(null);
      } catch (err) {
        setError(writeError(err, "Failed to update project type"));
      }
    },
    [activeProject, uid],
  );

  const archiveProject = useCallback(async () => {
    if (!uid || !archiveTarget) return;
    try {
      await updateDoc(projectPath(uid, archiveTarget.id), {
        archived: true,
        updatedAt: serverTimestamp(),
      });
      setArchiveTarget(null);
      setError(null);
      if (archiveTarget.id === activeProjectId) setActiveProjectId("");
    } catch (err) {
      setError(writeError(err, "Failed to archive project"));
    }
  }, [activeProjectId, archiveTarget, uid]);

  const deleteProject = useCallback(async () => {
    if (!uid || !deleteTarget || deletingProject) return;
    setDeletingProject(true);
    try {
      const targetId = deleteTarget.id;
      const projectRef = projectPath(uid, targetId);
      const rowsToDetach = (todos ?? []).filter(
        (row) => row.data.projectId === targetId,
      );
      const chunkSize = 400;
      for (let index = 0; index <= rowsToDetach.length; index += chunkSize) {
        const isLast = index + chunkSize >= rowsToDetach.length;
        const chunk = rowsToDetach.slice(index, index + chunkSize);
        if (chunk.length === 0 && !isLast) continue;
        const batch = writeBatch(projectRef.firestore);
        for (const row of chunk) {
          batch.update(todoPath(uid, row.id), {
            projectId: deleteField(),
            projectColumnId: deleteField(),
            projectOrder: deleteField(),
            projectCompletedColumnId: deleteField(),
            updatedAt: serverTimestamp(),
          } as UpdateData<TodoDoc>);
        }
        if (isLast) batch.delete(projectRef);
        await batch.commit();
        if (rowsToDetach.length === 0) break;
      }
      setDeleteTarget(null);
      setError(null);
      if (targetId === activeProjectId) setActiveProjectId("");
    } catch (err) {
      setError(writeError(err, "Failed to delete project"));
    } finally {
      setDeletingProject(false);
    }
  }, [activeProjectId, deleteTarget, deletingProject, todos, uid]);

  const addColumn = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!uid || !activeProject) return;
      const name = newColumnName.trim();
      if (!name) return;
      const columns = orderedColumns(activeProject.data);
      const next: ProjectColumn = {
        id: makeColumnId(name),
        name,
        order: columns.length,
      };
      try {
        await updateDoc(projectPath(uid, activeProject.id), {
          columns: [...columns, next],
          updatedAt: serverTimestamp(),
        });
        setNewColumnName("");
        setActiveColumnId(next.id);
        setError(null);
      } catch (err) {
        setError(writeError(err, "Failed to add column"));
      }
    },
    [activeProject, newColumnName, uid],
  );

  const saveColumnName = useCallback(
    async (columnId: string) => {
      if (!uid || !activeProject) return;
      const name = editingColumnName.trim();
      if (!name) return;
      const columns = orderedColumns(activeProject.data).map((column) =>
        column.id === columnId ? { ...column, name } : column,
      );
      try {
        await updateDoc(projectPath(uid, activeProject.id), {
          columns,
          updatedAt: serverTimestamp(),
        });
        setEditingColumnId(null);
        setEditingColumnName("");
        setError(null);
      } catch (err) {
        setError(writeError(err, "Failed to rename column"));
      }
    },
    [activeProject, editingColumnName, uid],
  );

  const removeColumn = useCallback(
    async (columnId: string) => {
      if (!uid || !activeProject) return;
      const columnTodos = todosByColumn.get(columnId) ?? [];
      if (columnTodos.length > 0 || activeColumns.length <= 1) return;
      const columns = activeColumns
        .filter((column) => column.id !== columnId)
        .map((column, index) => ({ ...column, order: index }));
      try {
        await updateDoc(projectPath(uid, activeProject.id), {
          columns,
          updatedAt: serverTimestamp(),
        });
        setError(null);
      } catch (err) {
        setError(writeError(err, "Failed to delete column"));
      }
    },
    [activeColumns, activeProject, todosByColumn, uid],
  );

  const moveColumn = useCallback(
    async (columnId: string, delta: -1 | 1) => {
      if (!uid || !activeProject) return;
      const index = activeColumns.findIndex((column) => column.id === columnId);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= activeColumns.length) return;
      const columns = [...activeColumns];
      const [column] = columns.splice(index, 1);
      columns.splice(nextIndex, 0, column);
      try {
        await updateDoc(projectPath(uid, activeProject.id), {
          columns: columns.map((item, order) => ({ ...item, order })),
          updatedAt: serverTimestamp(),
        });
        setError(null);
      } catch (err) {
        setError(writeError(err, "Failed to move column"));
      }
    },
    [activeColumns, activeProject, uid],
  );

  const addCard = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!uid || !activeProject) return;
      const title = cardDraft.title.trim();
      if (!title) {
        setError("Enter a card title first.");
        return;
      }
      const columnId = activeColumnId || defaultColumnId(activeProject.data);
      const rows = todosByColumn.get(columnId) ?? [];
      const payload: Record<string, unknown> = {
        title,
        done: false,
        projectId: activeProject.id,
        projectColumnId: columnId,
        projectOrder: nextProjectOrder(rows),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cardDraft.note.trim()) payload.note = cardDraft.note.trim();
      if (cardDraft.dueDate) payload.dueDate = cardDraft.dueDate;
      if (cardDraft.priority !== "none") payload.priority = cardDraft.priority;
      if (cardDraft.recurrence !== "none") payload.recurrence = cardDraft.recurrence;
      try {
        await addDoc(todosPath(uid), payload as unknown as TodoDoc);
        setCardDraft(EMPTY_CARD);
        setCardDetailsOpen(false);
        setError(null);
      } catch (err) {
        setError(writeError(err, "Failed to add card"));
      }
    },
    [activeColumnId, activeProject, cardDraft, todosByColumn, uid],
  );

  const saveCard = useCallback(
    async (row: TodoRow, draft: CardDraft) => {
      if (!uid) return;
      const title = draft.title.trim();
      if (!title) {
        throw new Error("Enter a card title first.");
      }
      const update: UpdateData<TodoDoc> = {
        title,
        updatedAt: serverTimestamp(),
        note: draft.note.trim() || deleteField(),
        dueDate: draft.dueDate || deleteField(),
        priority: draft.priority !== "none" ? draft.priority : deleteField(),
        recurrence:
          draft.recurrence !== "none" ? draft.recurrence : deleteField(),
      };
      try {
        await updateDoc(todoPath(uid, row.id), update);
        setEditingCard(null);
        setError(null);
      } catch (err) {
        throw new Error(writeError(err, "Failed to save card"));
      }
    },
    [uid],
  );

  const completeCard = useCallback(
    async (row: TodoRow) => {
      if (!uid || !activeProject) return;
      if (!hasActiveDay) {
        setError("Start your day before completing project todos.");
        return;
      }
      const doneColumn = completedColumnId(activeProject.data);
      const next = !row.data.done;
      const targetColumn = next ? doneColumn : defaultColumnId(activeProject.data);
      const targetRows = todosByColumn.get(targetColumn) ?? [];
      try {
        await updateDoc(todoPath(uid, row.id), {
          done: next,
          completedAt: next ? serverTimestamp() : null,
          projectColumnId: targetColumn,
          projectCompletedColumnId: doneColumn,
          projectOrder: nextProjectOrder(targetRows),
          updatedAt: serverTimestamp(),
        });
        if (next && row.data.recurrence && row.data.recurrence !== "none") {
          const baseDate = row.data.dueDate ?? today;
          const delta = row.data.recurrence === "daily" ? 1 : 7;
          const nextColumn =
            row.data.projectColumnId ?? defaultColumnId(activeProject.data);
          const payload: Record<string, unknown> = {
            title: row.data.title,
            done: false,
            dueDate: addDaysIso(baseDate, delta),
            recurrence: row.data.recurrence,
            projectId: activeProject.id,
            projectColumnId: nextColumn,
            projectOrder: nextProjectOrder(todosByColumn.get(nextColumn) ?? []),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (row.data.note) payload.note = row.data.note;
          if (row.data.priority) payload.priority = row.data.priority;
          await addDoc(todosPath(uid), payload as unknown as TodoDoc);
        }
        setError(null);
      } catch (err) {
        setError(writeError(err, "Failed to update card"));
      }
    },
    [activeProject, hasActiveDay, today, todosByColumn, uid],
  );

  const moveCard = useCallback(
    async (row: TodoRow, targetColumnId: string, targetOrder?: number) => {
      if (!uid || !activeProject) return;
      const rows = (todosByColumn.get(targetColumnId) ?? []).filter(
        (candidate) => candidate.id !== row.id,
      );
      const order =
        typeof targetOrder === "number" ? targetOrder : nextProjectOrder(rows);
      try {
        await updateDoc(todoPath(uid, row.id), {
          projectId: activeProject.id,
          projectColumnId: targetColumnId,
          projectOrder: order,
          updatedAt: serverTimestamp(),
        });
        setActiveColumnId(targetColumnId);
        setError(null);
      } catch (err) {
        setError(writeError(err, "Failed to move card"));
      }
    },
    [activeProject, todosByColumn, uid],
  );

  const deleteCard = useCallback(
    async (row: TodoRow) => {
      if (!uid) return;
      try {
        await deleteDoc(todoPath(uid, row.id));
        setError(null);
      } catch (err) {
        setError(writeError(err, "Failed to delete card"));
      }
    },
    [uid],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = String(event.active.id);
    setDraggingCardId(activeId.startsWith("card-") ? activeId.replace("card-", "") : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingCardId(null);
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : "";
      if (!activeId.startsWith("card-") || !overId) return;
      const todoId = activeId.replace("card-", "");
      const row = projectTodos.find((item) => item.id === todoId);
      if (!row) return;

      if (overId.startsWith("column-")) {
        void moveCard(row, overId.replace("column-", ""));
        return;
      }

      if (!overId.startsWith("card-") || overId === activeId) return;
      const targetId = overId.replace("card-", "");
      const target = projectTodos.find((item) => item.id === targetId);
      if (!target) return;
      const sourceColumnId = row.data.projectColumnId ?? activeColumns[0]?.id ?? "";
      const targetColumnId =
        target.data.projectColumnId ?? activeColumns[0]?.id ?? "";
      if (!targetColumnId) return;
      const targetRows = todosByColumn.get(targetColumnId) ?? [];
      const activeIndex = targetRows.findIndex((candidate) => candidate.id === row.id);
      const overIndex = targetRows.findIndex((candidate) => candidate.id === target.id);
      const shouldInsertAfter =
        sourceColumnId === targetColumnId &&
        activeIndex >= 0 &&
        overIndex >= 0 &&
        activeIndex < overIndex;
      const rows = targetRows.filter(
        (candidate) => candidate.id !== row.id,
      );
      const index = rows.findIndex((candidate) => candidate.id === target.id);
      const previous = shouldInsertAfter
        ? rows[index]?.data.projectOrder
        : rows[index - 1]?.data.projectOrder;
      const next = shouldInsertAfter
        ? rows[index + 1]?.data.projectOrder
        : rows[index]?.data.projectOrder;
      void moveCard(row, targetColumnId, orderBetween(previous, next));
    },
    [activeColumns, moveCard, projectTodos, todosByColumn],
  );

  if (projects === null || todos === null) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </section>
    );
  }

  return (
    <section className="flex min-h-[calc(100dvh-8rem)] flex-col gap-3 md:h-full md:min-h-0 md:overflow-hidden">
      <header className="sticky top-0 z-20 -mx-4 rounded-b-[22px] border-b border-border/80 bg-neutral-950/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur md:static md:mx-0 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-100 md:text-3xl">
              Projects
            </h1>
            <p className="mt-1 text-sm text-muted">
              Plan project todos on custom boards.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeProject ? (
              <button
                type="button"
                onClick={() => setActiveProjectId("")}
                aria-label="Back to all projects"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 md:rounded-md"
              >
                <ChevronLeft className="h-4 w-4" />
                All projects
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setProjectDraft(newProjectDraft());
                setCreateError(null);
                setCreateOpen(true);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-3 text-sm font-semibold text-black hover:bg-accent/90 md:rounded-md"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 md:rounded-md">
          {error}
        </div>
      ) : null}

      {activeProject ? (
        <>
          <div className="min-h-0 flex-1 md:h-full">
              <main className="flex min-h-0 min-w-0 flex-col gap-3 md:h-full">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                <div className="rounded-2xl border border-border/80 bg-panel/85 p-3 shadow-[0_6px_18px_rgba(0,0,0,0.16)] md:rounded-lg md:shadow-none">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <KanbanSquare className="h-5 w-5 shrink-0 text-accent" />
                        <input
                          value={editingProjectName}
                          onChange={(event) => setEditingProjectName(event.target.value)}
                          onBlur={() => void saveProjectName()}
                          className="h-9 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 text-lg font-semibold text-neutral-100 focus:border-border focus:bg-neutral-950 focus:outline-none md:rounded-md"
                        />
                      </div>
                      <select
                        value={normalizedProjectType(activeProject.data)}
                        onChange={(event) =>
                          void saveProjectType(event.target.value as ProjectType)
                        }
                        className="h-9 rounded-xl border border-border bg-neutral-950 px-3 text-sm font-semibold text-neutral-200 focus:border-accent focus:outline-none md:rounded-md"
                        aria-label="Project type"
                      >
                        <option value="dev">Dev project</option>
                        <option value="content">Content creation</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <form onSubmit={addColumn} className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
                        <input
                          value={newColumnName}
                          onChange={(event) => setNewColumnName(event.target.value)}
                          placeholder="New column"
                          className="h-9 min-w-0 rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none md:rounded-md"
                        />
                        <button
                          type="submit"
                          disabled={!newColumnName.trim()}
                          className="h-9 rounded-xl border border-border px-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 disabled:opacity-50 md:rounded-md"
                        >
                          Add
                        </button>
                      </form>
                      <ProjectActionsMenu
                        archived={activeProject.data.archived}
                        onArchive={() => setArchiveTarget(activeProject)}
                        onDelete={() => setDeleteTarget(activeProject)}
                      />
                    </div>
                  </div>
                </div>

                <ProjectDetailSummary
                  project={activeProject}
                  stats={activeProjectStats}
                  milestone={nextMilestoneFromRows(projectTodos)}
                />

                <form
                  onSubmit={addCard}
                  className="rounded-2xl border border-border/80 bg-panel/85 p-3 shadow-[0_6px_18px_rgba(0,0,0,0.16)] md:rounded-lg md:shadow-none"
                >
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <input
                      value={cardDraft.title}
                      onChange={(event) =>
                        setCardDraft((draft) => ({ ...draft, title: event.target.value }))
                      }
                      placeholder="Add card"
                      className="h-10 rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none md:rounded-md"
                    />
                    <button
                      type="button"
                      onClick={() => setCardDetailsOpen((open) => !open)}
                      aria-expanded={cardDetailsOpen}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 md:rounded-md"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      Details
                    </button>
                    <button
                      type="submit"
                      disabled={!cardDraft.title.trim()}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50 md:rounded-md"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                  {cardDetailsOpen ? (
                    <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_9rem_9rem_9rem]">
                      <input
                        value={cardDraft.note}
                        onChange={(event) =>
                          setCardDraft((draft) => ({ ...draft, note: event.target.value }))
                        }
                        placeholder="Note"
                        className="h-10 rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none md:rounded-md"
                      />
                      <input
                        type="date"
                        value={cardDraft.dueDate}
                        onChange={(event) =>
                          setCardDraft((draft) => ({ ...draft, dueDate: event.target.value }))
                        }
                        className="h-10 rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none md:rounded-md"
                        aria-label="Due date"
                      />
                      <select
                        value={cardDraft.priority}
                        onChange={(event) =>
                          setCardDraft((draft) => ({
                            ...draft,
                            priority: event.target.value as TodoPriority | "none",
                          }))
                        }
                        className="h-10 rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none md:rounded-md"
                        aria-label="Priority"
                      >
                        <option value="none">Priority</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <select
                        value={cardDraft.recurrence}
                        onChange={(event) =>
                          setCardDraft((draft) => ({
                            ...draft,
                            recurrence: event.target.value as TodoRecurrence,
                          }))
                        }
                        className="h-10 rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none md:rounded-md"
                        aria-label="Recurrence"
                      >
                        <option value="none">Repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                  ) : null}
                </form>

                <ColumnTabs
                  columns={activeColumns}
                  activeColumnId={activeColumnId}
                  todosByColumn={todosByColumn}
                  onSelect={setActiveColumnId}
                />

                <div className="hidden min-h-0 flex-1 md:block">
                  <div className="min-h-0 min-w-0 md:h-full">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCorners}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragCancel={() => setDraggingCardId(null)}
                    >
                      <div className="flex h-full gap-3 overflow-x-auto pb-2">
                        {activeColumns.map((column, index) => (
                          <KanbanColumn
                            key={column.id}
                            column={column}
                            index={index}
                            totalColumns={activeColumns.length}
                            rows={todosByColumn.get(column.id) ?? []}
                            editingColumnId={editingColumnId}
                            editingColumnName={editingColumnName}
                            hasActiveDay={hasActiveDay}
                            columns={activeColumns}
                            onEditColumn={(id, name) => {
                              setEditingColumnId(id);
                              setEditingColumnName(name);
                            }}
                            onColumnNameChange={setEditingColumnName}
                            onSaveColumn={() => void saveColumnName(column.id)}
                            onCancelColumn={() => setEditingColumnId(null)}
                            onRemoveColumn={() => void removeColumn(column.id)}
                            onMoveColumn={(delta) => void moveColumn(column.id, delta)}
                            onComplete={completeCard}
                            onEdit={setEditingCard}
                            onDelete={deleteCard}
                            onMove={moveCard}
                          />
                        ))}
                      </div>
                      <DragOverlay>
                        {draggingCard ? <KanbanCardPreview row={draggingCard} /> : null}
                      </DragOverlay>
                    </DndContext>
                  </div>
                </div>

                <div className="md:hidden">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setDraggingCardId(null)}
                  >
                    {activeColumns
                      .filter((column) => column.id === activeColumnId)
                      .map((column, index) => (
                        <KanbanColumn
                          key={column.id}
                          column={column}
                          index={index}
                          totalColumns={activeColumns.length}
                          rows={todosByColumn.get(column.id) ?? []}
                          editingColumnId={editingColumnId}
                          editingColumnName={editingColumnName}
                          hasActiveDay={hasActiveDay}
                          columns={activeColumns}
                          mobile
                          onEditColumn={(id, name) => {
                            setEditingColumnId(id);
                            setEditingColumnName(name);
                          }}
                          onColumnNameChange={setEditingColumnName}
                          onSaveColumn={() => void saveColumnName(column.id)}
                          onCancelColumn={() => setEditingColumnId(null)}
                          onRemoveColumn={() => void removeColumn(column.id)}
                          onMoveColumn={(delta) => void moveColumn(column.id, delta)}
                          onComplete={completeCard}
                          onEdit={setEditingCard}
                          onDelete={deleteCard}
                          onMove={moveCard}
                        />
                      ))}
                    <DragOverlay>
                      {draggingCard ? <KanbanCardPreview row={draggingCard} /> : null}
                    </DragOverlay>
                  </DndContext>
                </div>
                </div>
              </main>
          </div>
        </>
      ) : (
        <ProjectsOverview
          projects={visibleProjects}
          todos={todos ?? []}
          projectStats={projectStats}
          onOpenProject={setActiveProjectId}
        />
      )}

      {createOpen ? (
        <CreateProjectModal
          draft={projectDraft}
          error={createError}
          saving={creatingProject}
          onChange={setProjectDraft}
          onClose={() => {
            if (creatingProject) return;
            setCreateOpen(false);
            setCreateError(null);
          }}
          onCreate={() => void createProject()}
        />
      ) : null}

      {editingCard ? (
        <CardEditor
          row={editingCard}
          onClose={() => setEditingCard(null)}
          onSave={(draft) => saveCard(editingCard, draft)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive project?"
        description={
          archiveTarget
            ? `"${archiveTarget.data.name}" will leave the active project list but its todos stay saved.`
            : undefined
        }
        confirmLabel="Archive"
        onConfirm={() => void archiveProject()}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete project?"
        confirmLabel="Delete project"
        tone="danger"
        busy={deletingProject}
        onConfirm={() => void deleteProject()}
        onCancel={() => {
          if (!deletingProject) setDeleteTarget(null);
        }}
      >
        <div className="space-y-2 text-xs leading-relaxed text-muted">
          <p>
            {deleteTarget
              ? `"${deleteTarget.data.name}" will be permanently removed.`
              : "This project will be permanently removed."}
          </p>
          <p>
            Existing cards are kept in Todos and detached from this board, so
            task history is not deleted.
          </p>
        </div>
      </ConfirmDialog>
    </section>
  );
}

function ProjectsOverview({
  projects,
  todos,
  projectStats,
  onOpenProject,
}: {
  projects: ProjectRow[];
  todos: TodoRow[];
  projectStats: Map<string, ProjectStats>;
  onOpenProject: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ProjectType>("all");
  const totals = projects.reduce(
    (current, project) => {
      const stats = projectStats.get(project.id) ?? statsFromRows([]);
      current.totalCards += stats.totalCards;
      current.completedCards += stats.completedCards;
      current.openCards += stats.openCards;
      return current;
    },
    { totalCards: 0, completedCards: 0, openCards: 0 },
  );
  const totalProgress = totals.totalCards
    ? Math.round((totals.completedCards / totals.totalCards) * 100)
    : 0;
  const filteredProjects = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return projects.filter((project) => {
      const type = normalizedProjectType(project.data);
      if (typeFilter !== "all" && type !== typeFilter) return false;
      if (!term) return true;
      const searchable = [
        project.data.name,
        project.data.description ?? "",
        project.data.repositoryUrl ?? "",
        project.data.topic ?? "",
        ...(project.data.techStack ?? []),
        ...(project.data.contentPlatforms ?? []).map(platformLabel),
        projectTypeLabel(type),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(term);
    });
  }, [projects, searchQuery, typeFilter]);

  return (
    <main className="min-h-0 flex-1 space-y-4 overflow-x-hidden pb-2 md:overflow-y-auto">
      <div className="border-b border-border pb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-100">
            Current projects
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Track active dev and content work with project context, progress, and Kanban todos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-border/80 rounded-2xl border border-border/80 bg-panel/85 shadow-[0_6px_18px_rgba(0,0,0,0.16)] md:rounded-lg md:shadow-none">
        <OverviewStat label="Projects" value={projects.length} />
        <OverviewStat label="Open" value={totals.openCards} />
        <OverviewStat label="Completed" value={totals.completedCards} />
        <OverviewStat label="Progress" value={`${totalProgress}%`} />
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <label className="relative block min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search projects"
            className="h-10 w-full rounded-xl border border-border bg-neutral-950 pl-9 pr-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none md:rounded-md"
          />
        </label>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-neutral-950 p-1 md:w-[22rem] md:rounded-md">
          {PROJECT_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setTypeFilter(filter.value)}
              aria-pressed={typeFilter === filter.value}
              className={clsx(
                "h-8 rounded-lg px-2 text-xs font-semibold transition-colors md:rounded",
                typeFilter === filter.value
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-muted hover:bg-neutral-900 hover:text-neutral-100",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-panel/75 p-5 shadow-[0_6px_18px_rgba(0,0,0,0.16)] md:rounded-lg md:shadow-none">
          <h3 className="text-base font-semibold text-neutral-100">No current projects</h3>
          <p className="mt-1 text-sm text-muted">
            Create a project to track its board, type, milestones, and todo progress.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredProjects.map((project) => {
            const projectRows = todos.filter(
              (row) => row.data.projectId === project.id,
            );
            return (
            <ProjectOverviewItem
              key={project.id}
              project={project}
              stats={projectStats.get(project.id) ?? statsFromRows([])}
              milestone={nextMilestoneFromRows(projectRows)}
              onOpen={() => onOpenProject(project.id)}
            />
            );
          })}
          {filteredProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-panel/75 p-5 text-sm text-muted shadow-[0_6px_18px_rgba(0,0,0,0.16)] md:col-span-2 md:rounded-lg md:shadow-none 2xl:col-span-3">
              No projects match that search.
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}

function ProjectDetailSummary({
  project,
  stats,
  milestone,
}: {
  project: ProjectRow;
  stats: ProjectStats;
  milestone: ProjectMilestone | null;
}) {
  const techStack = project.data.techStack ?? [];
  const platforms = project.data.contentPlatforms ?? [];
  const type = normalizedProjectType(project.data);
  return (
    <section className="grid gap-3 rounded-2xl border border-border/80 bg-panel/85 p-3 shadow-[0_6px_18px_rgba(0,0,0,0.16)] md:rounded-lg md:shadow-none lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ProjectTypeBadge type={type} />
          {type === "dev" ? (
            <RepositoryStatus url={project.data.repositoryUrl} compact />
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm leading-5 text-muted">
          {project.data.description || "No description set for this project."}
        </p>
        {type === "content" ? (
          <div className="mt-3 rounded-xl border border-border/70 bg-neutral-950/40 px-3 py-2 md:rounded-md">
            <div className="text-[10px] font-semibold text-muted">Topic</div>
            <div className="mt-1 truncate text-sm font-semibold text-neutral-100">
              {project.data.topic || "No topic set."}
            </div>
          </div>
        ) : null}
        <div className="mt-3 rounded-xl border border-border/70 bg-neutral-950/40 px-3 py-2 md:rounded-md">
          <div className="text-[10px] font-semibold text-muted">
            Next milestone
          </div>
          {milestone ? (
            <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0 truncate text-sm font-semibold text-neutral-100">
                {milestone.title}
              </div>
              {milestone.dueDate ? (
                <span className="shrink-0 text-xs text-muted">
                  {formatDate(milestone.dueDate)}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mt-1 text-sm text-muted">No open Kanban todo.</div>
          )}
        </div>
        {type === "content" ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {platforms.length ? (
              platforms.map((platform) => (
                <PlatformChip key={platform} platform={platform} />
              ))
            ) : (
              <span className="text-xs text-muted">No platforms selected.</span>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {techStack.length ? (
            techStack.map((item) => (
              <TechStackChip key={item} name={item} />
            ))
            ) : (
              <span className="text-xs text-muted">No tech stack set</span>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 divide-x divide-border/80 rounded-2xl border border-border/80 bg-neutral-950 lg:grid-cols-2 lg:divide-x-0 lg:divide-y md:rounded-lg">
        <OverviewStat label="Total" value={stats.totalCards} />
        <OverviewStat label="Open" value={stats.openCards} />
        <OverviewStat label="Done" value={stats.completedCards} />
        <OverviewStat label="Progress" value={`${stats.progressPercent}%`} />
      </div>
    </section>
  );
}

function OverviewStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 px-3 py-3">
      <div className="text-lg font-semibold text-neutral-100">{value}</div>
      <div className="mt-0.5 truncate text-xs text-muted">{label}</div>
    </div>
  );
}

function ProjectOverviewItem({
  project,
  stats,
  milestone,
  onOpen,
}: {
  project: ProjectRow;
  stats: ProjectStats;
  milestone: ProjectMilestone | null;
  onOpen: () => void;
}) {
  const techStack = project.data.techStack ?? [];
  const platforms = project.data.contentPlatforms ?? [];
  const type = normalizedProjectType(project.data);
  return (
    <article className="rounded-2xl border border-border/80 bg-panel/85 p-4 shadow-[0_6px_18px_rgba(0,0,0,0.16)] transition-colors hover:border-neutral-700 md:rounded-lg md:shadow-none">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ProjectTypeBadge type={type} />
            {type === "dev" ? (
              <RepositoryStatus url={project.data.repositoryUrl} compact />
            ) : null}
          </div>
          <h3 className="truncate text-lg font-semibold text-neutral-100">
            {project.data.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">
            {project.data.description || "No description yet."}
          </p>
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="h-9 shrink-0 rounded-xl border border-border px-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 md:rounded-md"
        >
          Open
        </button>
      </div>

      <div className="mt-4 grid grid-cols-4 divide-x divide-border border-y border-border py-2">
        <OverviewStat label="Total" value={stats.totalCards} />
        <OverviewStat label="Open" value={stats.openCards} />
        <OverviewStat label="Done" value={stats.completedCards} />
        <OverviewStat label="Progress" value={`${stats.progressPercent}%`} />
      </div>

      <div className="mt-4 h-1.5 rounded bg-neutral-900">
        <div
          className="h-full rounded bg-accent"
          style={{ width: `${stats.progressPercent}%` }}
        />
      </div>

      <div className="mt-4 rounded-xl border border-border/70 bg-neutral-950/40 px-3 py-2 md:rounded-md">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-muted">
              Next milestone
            </div>
            {milestone ? (
              <div className="mt-1 truncate text-sm font-semibold text-neutral-100">
                {milestone.title}
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted">No open Kanban todo.</div>
            )}
          </div>
          {milestone?.dueDate ? (
            <span className="shrink-0 text-xs text-muted">
              {formatDate(milestone.dueDate)}
            </span>
          ) : milestone?.priority ? (
            <span className="shrink-0 text-xs capitalize text-muted">
              {milestone.priority}
            </span>
          ) : null}
        </div>
      </div>

      {type === "content" ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-border/70 bg-neutral-950/40 px-3 py-2 md:rounded-md">
            <div className="text-[10px] font-semibold text-muted">Topic</div>
            <div className="mt-1 truncate text-sm font-semibold text-neutral-100">
              {project.data.topic || "No topic set."}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {platforms.length ? (
              platforms.map((platform) => (
                <PlatformChip key={platform} platform={platform} />
              ))
            ) : (
              <span className="text-xs text-muted">No platforms selected.</span>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3">
            <RepositoryStatus url={project.data.repositoryUrl} />
          </div>
          {techStack.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {techStack.map((item) => (
                <TechStackChip key={item} name={item} />
              ))}
            </div>
          ) : (
            <div className="mt-3 text-xs text-muted">No tech stack set.</div>
          )}
        </>
      )}
    </article>
  );
}

function ProjectTypeBadge({ type }: { type: ProjectType }) {
  const Icon = type === "content" ? Clapperboard : Code2;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-neutral-950 px-2 py-1 text-xs font-medium text-neutral-300 md:rounded">
      <Icon className="h-3.5 w-3.5 text-muted" />
      {projectTypeLabel(type)}
    </span>
  );
}

function RepositoryStatus({
  url,
  compact,
}: {
  url?: string;
  compact?: boolean;
}) {
  const label = repositoryLabel(url);
  const className = clsx(
    "inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-border bg-neutral-950 px-2 py-1 text-xs md:rounded",
    url && !compact ? "text-neutral-300 hover:text-neutral-100" : "text-muted",
  );
  const content = (
    <>
      <GithubLogo className="h-4 w-4 shrink-0" />
      <span className="truncate">{compact && url ? "GitHub" : label}</span>
      {url && !compact ? <ExternalLink className="h-3 w-3 shrink-0" /> : null}
    </>
  );

  if (!url || compact) {
    return <div className={className}>{content}</div>;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      {content}
    </a>
  );
}

function CreateProjectModal({
  draft,
  error,
  saving,
  onChange,
  onClose,
  onCreate,
}: {
  draft: ProjectDraft;
  error: string | null;
  saving: boolean;
  onChange: (draft: ProjectDraft) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const update = (patch: Partial<ProjectDraft>) => onChange({ ...draft, ...patch });
  const canSubmit =
    draft.name.trim().length > 0 &&
    draft.columns.some((column) => column.name.trim().length > 0) &&
    !saving;

  const updateColumn = (columnId: string, name: string) => {
    update({
      columns: draft.columns.map((column) =>
        column.id === columnId ? { ...column, name } : column,
      ),
    });
  };

  const moveColumn = (columnId: string, delta: -1 | 1) => {
    const index = draft.columns.findIndex((column) => column.id === columnId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= draft.columns.length) return;
    const columns = [...draft.columns];
    const [column] = columns.splice(index, 1);
    columns.splice(nextIndex, 0, column);
    update({ columns: columns.map((item, order) => ({ ...item, order })) });
  };
  const togglePlatform = (platform: ProjectContentPlatform) => {
    update({
      contentPlatforms: draft.contentPlatforms.includes(platform)
        ? draft.contentPlatforms.filter((item) => item !== platform)
        : [...draft.contentPlatforms, platform],
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create project"
      className="ui-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
        className="ui-bottom-sheet max-h-[calc(100dvh-0.75rem)] w-full overflow-y-auto rounded-t-lg border border-border/80 bg-panel p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))] shadow-[0_-12px_36px_rgba(0,0,0,0.45)] md:max-w-2xl md:rounded-lg md:pb-4 md:shadow-[0_18px_42px_rgba(0,0,0,0.34)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-700 md:hidden" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-lg font-semibold text-neutral-100">
            Create project
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl p-1.5 text-muted hover:bg-neutral-900 hover:text-neutral-100 md:rounded-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 md:rounded-md">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-muted">Name</span>
            <input
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none md:rounded-md"
              placeholder="Compass"
            />
          </label>

          <div>
            <div className="text-xs font-semibold text-muted">Project type</div>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl border border-border bg-neutral-950 p-1 md:rounded-md">
              {PROJECT_TYPE_FILTERS.filter((item) => item.value !== "all").map(
                (item) => {
                  const value = item.value as ProjectType;
                  const Icon = value === "content" ? Clapperboard : Code2;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => update({ type: value })}
                      aria-pressed={draft.type === value}
                      className={clsx(
                        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold transition-colors md:rounded",
                        draft.type === value
                          ? "bg-neutral-800 text-neutral-100"
                          : "text-muted hover:bg-neutral-900 hover:text-neutral-100",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label === "Dev" ? "Dev project" : "Content creation"}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-muted">Description</span>
            <textarea
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none md:rounded-md"
              placeholder="What this project tracks"
            />
          </label>

          {draft.type === "content" ? (
            <div className="grid gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-muted">Topic</span>
                <input
                  value={draft.topic}
                  onChange={(event) => update({ topic: event.target.value })}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none md:rounded-md"
                  placeholder="Productivity, school, devlog"
                />
              </label>
              <div>
                <div className="text-xs font-semibold text-muted">
                  Platforms
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CONTENT_PLATFORM_OPTIONS.map((platform) => {
                    const selected = draft.contentPlatforms.includes(platform);
                    return (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => togglePlatform(platform)}
                        aria-pressed={selected}
                        className={clsx(
                          "rounded-lg border px-2 py-1 text-xs font-medium transition-colors md:rounded",
                          selected
                            ? "border-accent/70 bg-accent/10 text-neutral-100"
                            : "border-border bg-neutral-950 text-muted hover:text-neutral-200",
                        )}
                      >
                        <PlatformLogo
                          platform={platform}
                          className="flex h-4 w-4 shrink-0 items-center justify-center"
                        />
                        {platformLabel(platform)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-muted">Repository link</span>
                  <input
                    value={draft.repositoryUrl}
                    onChange={(event) => update({ repositoryUrl: event.target.value })}
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none md:rounded-md"
                    placeholder="https://github.com/..."
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-muted">Tech stack</span>
                  <input
                    value={draft.techStackInput}
                    onChange={(event) => update({ techStackInput: event.target.value })}
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none md:rounded-md"
                    placeholder="Next.js, Firebase, Tailwind"
                  />
                </label>
              </div>

              {parseTechStack(draft.techStackInput).length ? (
                <div className="flex flex-wrap gap-1.5">
                  {parseTechStack(draft.techStackInput).map((item) => (
                    <TechStackChip key={item} name={item} />
                  ))}
                </div>
              ) : null}
            </>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-100">Columns</h3>
              <button
                type="button"
                onClick={() =>
                  update({
                    columns: [
                      ...draft.columns,
                      {
                        id: makeColumnId("Column"),
                        name: "Column",
                        order: draft.columns.length,
                      },
                    ],
                  })
                }
                disabled={draft.columns.length >= 12}
                className="h-8 rounded-xl border border-border px-3 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 md:rounded-md"
              >
                Add column
              </button>
            </div>

            <div className="space-y-2">
              {draft.columns.map((column, index) => (
                <div
                  key={column.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2"
                >
                  <input
                    value={column.name}
                    onChange={(event) => updateColumn(column.id, event.target.value)}
                    className="h-9 min-w-0 rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none md:rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => moveColumn(column.id, -1)}
                    disabled={index === 0}
                    aria-label="Move column left"
                    className="h-9 w-9 rounded-xl border border-border text-muted hover:bg-neutral-900 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 md:rounded-md"
                  >
                    <ChevronLeft className="mx-auto h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(column.id, 1)}
                    disabled={index === draft.columns.length - 1}
                    aria-label="Move column right"
                    className="h-9 w-9 rounded-xl border border-border text-muted hover:bg-neutral-900 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 md:rounded-md"
                  >
                    <ChevronRight className="mx-auto h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        columns: draft.columns
                          .filter((item) => item.id !== column.id)
                          .map((item, order) => ({ ...item, order })),
                      })
                    }
                    disabled={draft.columns.length <= 1}
                    aria-label="Remove column"
                    className="h-9 w-9 rounded-xl border border-border text-muted hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40 md:rounded-md"
                  >
                    <Trash2 className="mx-auto h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-10 rounded-xl border border-border px-4 text-sm font-semibold text-muted hover:bg-neutral-900 hover:text-neutral-100 disabled:opacity-50 md:rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50 md:rounded-md"
          >
            <Plus className="h-4 w-4" />
            {saving ? "Creating" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ColumnTabs({
  columns,
  activeColumnId,
  todosByColumn,
  onSelect,
}: {
  columns: ProjectColumn[];
  activeColumnId: string;
  todosByColumn: Map<string, TodoRow[]>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto border-y border-border/80 bg-neutral-950 px-4 py-2 md:hidden">
      <div className="flex min-w-max gap-2">
        {columns.map((column) => (
          <button
            key={column.id}
            type="button"
            onClick={() => onSelect(column.id)}
            aria-pressed={activeColumnId === column.id}
            className={clsx(
              "h-9 rounded-xl border px-3 text-sm font-semibold",
              activeColumnId === column.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-neutral-950 text-muted",
            )}
          >
            {column.name} · {todosByColumn.get(column.id)?.length ?? 0}
          </button>
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
  index,
  totalColumns,
  rows,
  editingColumnId,
  editingColumnName,
  hasActiveDay,
  columns,
  mobile = false,
  onEditColumn,
  onColumnNameChange,
  onSaveColumn,
  onCancelColumn,
  onRemoveColumn,
  onMoveColumn,
  onComplete,
  onEdit,
  onDelete,
  onMove,
}: {
  column: ProjectColumn;
  index: number;
  totalColumns: number;
  rows: TodoRow[];
  editingColumnId: string | null;
  editingColumnName: string;
  hasActiveDay: boolean;
  columns: ProjectColumn[];
  mobile?: boolean;
  onEditColumn: (id: string, name: string) => void;
  onColumnNameChange: (name: string) => void;
  onSaveColumn: () => void;
  onCancelColumn: () => void;
  onRemoveColumn: () => void;
  onMoveColumn: (delta: -1 | 1) => void;
  onComplete: (row: TodoRow) => Promise<void>;
  onEdit: (row: TodoRow) => void;
  onDelete: (row: TodoRow) => void;
  onMove: (row: TodoRow, columnId: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${column.id}` });
  const isEditing = editingColumnId === column.id;
  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex flex-col rounded-2xl border bg-panel/85 shadow-[0_6px_18px_rgba(0,0,0,0.16)] transition-colors md:rounded-lg md:shadow-none",
        isOver ? "border-accent bg-neutral-900/80" : "border-border",
        mobile
          ? "h-[calc(100dvh-18rem)] min-h-96 w-full"
          : "h-full min-w-[18rem] flex-1 basis-72",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {isEditing ? (
          <input
            value={editingColumnName}
            onChange={(event) => onColumnNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSaveColumn();
              if (event.key === "Escape") onCancelColumn();
            }}
            autoFocus
            className="h-8 min-w-0 flex-1 rounded-xl border border-border bg-neutral-950 px-2 text-sm text-neutral-100 focus:border-accent focus:outline-none md:rounded-md"
          />
        ) : (
          <button
            type="button"
            onClick={() => onEditColumn(column.id, column.name)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-neutral-100"
          >
            {column.name}
          </button>
        )}
        <span className="text-xs text-muted">{rows.length}</span>
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={onSaveColumn}
              aria-label="Save column"
              className="rounded-xl p-1.5 text-muted hover:bg-neutral-900 hover:text-neutral-100 md:rounded-md"
            >
              <Save className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onCancelColumn}
              aria-label="Cancel column edit"
              className="rounded-xl p-1.5 text-muted hover:bg-neutral-900 hover:text-neutral-100 md:rounded-md"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <ColumnMenu
            canMoveLeft={index > 0}
            canMoveRight={index < totalColumns - 1}
            canRemove={rows.length === 0 && totalColumns > 1}
            onEdit={() => onEditColumn(column.id, column.name)}
            onMoveLeft={() => onMoveColumn(-1)}
            onMoveRight={() => onMoveColumn(1)}
            onRemove={onRemoveColumn}
          />
        )}
      </div>
      <SortableContext
        items={rows.map((row) => `card-${row.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {rows.length === 0 ? (
            <div
              className={clsx(
                "flex h-full min-h-28 items-center justify-center rounded-2xl border border-dashed px-3 py-8 text-center text-sm md:rounded-lg",
                isOver
                  ? "border-accent/70 bg-accent/10 text-accent"
                  : "border-border text-muted",
              )}
            >
              Drop cards here
            </div>
          ) : (
            rows.map((row) => (
              <KanbanCard
                key={row.id}
                row={row}
                hasActiveDay={hasActiveDay}
                columns={columns}
                onComplete={onComplete}
                onEdit={onEdit}
                onDelete={onDelete}
                onMove={onMove}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function ProjectActionsMenu({
  archived,
  onArchive,
  onDelete,
}: {
  archived: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Project actions"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted hover:bg-neutral-900 hover:text-neutral-100 md:rounded-md"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-xl border border-border bg-neutral-950 shadow-[0_10px_24px_rgba(0,0,0,0.32)] md:rounded-md"
        >
          <MenuButton
            onClick={() => {
              setOpen(false);
              onArchive();
            }}
            label="Archive"
            disabled={archived}
            icon={<Archive className="h-4 w-4" />}
          />
          <MenuButton
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            label="Delete"
            icon={<Trash2 className="h-4 w-4" />}
            danger
          />
        </div>
      ) : null}
    </div>
  );
}

function ColumnMenu({
  canMoveLeft,
  canMoveRight,
  canRemove,
  onEdit,
  onMoveLeft,
  onMoveRight,
  onRemove,
}: {
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canRemove: boolean;
  onEdit: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Column actions"
        className="rounded-xl p-1.5 text-muted hover:bg-neutral-900 hover:text-neutral-100 md:rounded-md"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-xl border border-border bg-neutral-950 shadow-[0_10px_24px_rgba(0,0,0,0.32)] md:rounded-md">
          <MenuButton onClick={onEdit} label="Rename" icon={<Pencil className="h-4 w-4" />} />
          <MenuButton onClick={onMoveLeft} label="Move left" disabled={!canMoveLeft} icon={<ChevronLeft className="h-4 w-4" />} />
          <MenuButton onClick={onMoveRight} label="Move right" disabled={!canMoveRight} icon={<ChevronRight className="h-4 w-4" />} />
          <MenuButton onClick={onRemove} label="Delete empty column" disabled={!canRemove} icon={<Trash2 className="h-4 w-4" />} danger />
        </div>
      ) : null}
    </div>
  );
}

function KanbanCard({
  row,
  hasActiveDay,
  columns,
  onComplete,
  onEdit,
  onDelete,
  onMove,
}: {
  row: TodoRow;
  hasActiveDay: boolean;
  columns: ProjectColumn[];
  onComplete: (row: TodoRow) => Promise<void>;
  onEdit: (row: TodoRow) => void;
  onDelete: (row: TodoRow) => void;
  onMove: (row: TodoRow, columnId: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `card-${row.id}`,
      data: { columnId: row.data.projectColumnId },
    });
  const due = formatDate(row.data.dueDate);
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        "group rounded-2xl border border-border/80 bg-neutral-950 p-3 text-left shadow-[0_4px_12px_rgba(0,0,0,0.14)] transition-colors md:rounded-lg md:touch-none md:cursor-grab md:shadow-sm md:active:cursor-grabbing",
        row.data.done && "opacity-65",
        isDragging && "border-accent opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-border bg-neutral-900 text-muted group-hover:border-neutral-600 group-hover:text-neutral-100 md:rounded-md"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void onComplete(row)}
          disabled={!hasActiveDay}
          aria-label={row.data.done ? "Mark card open" : "Complete card"}
          className="mt-0.5 shrink-0"
        >
          {row.data.done ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <Circle className="h-4 w-4 text-muted" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <h3
            className={clsx(
              "break-words text-sm font-semibold leading-5 text-neutral-100",
              row.data.done && "text-muted line-through",
            )}
          >
            {row.data.title}
          </h3>
          {row.data.note ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
              {row.data.note}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-12 text-xs text-muted">
        {due ? (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {due}
          </span>
        ) : null}
        {row.data.priority ? (
          <span className="capitalize">{row.data.priority}</span>
        ) : null}
        {row.data.recurrence && row.data.recurrence !== "none" ? (
          <span className="capitalize">{row.data.recurrence}</span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 pl-12">
        <select
          onPointerDown={(event) => event.stopPropagation()}
          value={row.data.projectColumnId ?? ""}
          onChange={(event) => void onMove(row, event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-xl border border-border bg-neutral-950 px-2 text-xs text-neutral-100 focus:border-accent focus:outline-none md:hidden"
          aria-label={`Move ${row.data.title}`}
        >
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              Move to {column.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onEdit(row)}
            aria-label={`Edit ${row.data.title}`}
            className="rounded-xl p-1.5 text-muted hover:bg-neutral-900 hover:text-neutral-100 md:rounded-md"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onDelete(row)}
            aria-label={`Delete ${row.data.title}`}
            className="rounded-xl p-1.5 text-muted hover:bg-red-500/10 hover:text-red-300 md:rounded-md"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function KanbanCardPreview({ row }: { row: TodoRow }) {
  const due = formatDate(row.data.dueDate);
  return (
    <article className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-accent bg-neutral-950 p-3 text-left shadow-[0_14px_32px_rgba(0,0,0,0.4)] md:rounded-lg">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-300 md:rounded-md">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold leading-5 text-neutral-100">
            {row.data.title}
          </h3>
          {row.data.note ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
              {row.data.note}
            </p>
          ) : null}
        </div>
      </div>
      {(due || row.data.priority || row.data.recurrence) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-9 text-xs text-muted">
          {due ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {due}
            </span>
          ) : null}
          {row.data.priority ? (
            <span className="capitalize">{row.data.priority}</span>
          ) : null}
          {row.data.recurrence && row.data.recurrence !== "none" ? (
            <span className="capitalize">{row.data.recurrence}</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MenuButton({
  label,
  icon,
  disabled,
  danger,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40",
        danger
          ? "text-red-300 hover:bg-red-500/10"
          : "text-neutral-100 hover:bg-neutral-900",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function CardEditor({
  row,
  onClose,
  onSave,
}: {
  row: TodoRow;
  onClose: () => void;
  onSave: (draft: CardDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CardDraft>({
    title: row.data.title,
    note: row.data.note ?? "",
    dueDate: row.data.dueDate ?? "",
    priority: row.data.priority ?? "none",
    recurrence: row.data.recurrence ?? "none",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit card"
      className="ui-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.title.trim()) {
            setError("Enter a card title first.");
            return;
          }
          setSaving(true);
          setError(null);
          void onSave(draft)
            .catch((err) => setError(writeError(err, "Failed to save card")))
            .finally(() => setSaving(false));
        }}
        className="ui-bottom-sheet w-full max-w-lg rounded-t-lg border border-border/80 bg-panel p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))] shadow-[0_-12px_36px_rgba(0,0,0,0.45)] md:rounded-lg md:pb-4 md:shadow-[0_18px_42px_rgba(0,0,0,0.34)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-700 md:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-100">Edit card</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl p-1.5 text-muted hover:bg-neutral-900 hover:text-neutral-100 md:rounded-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 md:rounded-md">
              {error}
            </div>
          ) : null}
          <label className="block">
            <span className="text-xs font-semibold text-muted">Title</span>
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              className="mt-1 h-10 w-full rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none md:rounded-md"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted">Note</span>
            <textarea
              value={draft.note}
              onChange={(event) =>
                setDraft((current) => ({ ...current, note: event.target.value }))
              }
              rows={4}
              className="mt-1 w-full rounded-xl border border-border bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-accent focus:outline-none md:rounded-md"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold text-muted">Due</span>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, dueDate: event.target.value }))
                }
                className="mt-1 h-10 w-full rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none md:rounded-md"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">Priority</span>
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: event.target.value as TodoPriority | "none",
                  }))
                }
                className="mt-1 h-10 w-full rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none md:rounded-md"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">Repeat</span>
              <select
                value={draft.recurrence}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    recurrence: event.target.value as TodoRecurrence,
                  }))
                }
                className="mt-1 h-10 w-full rounded-xl border border-border bg-neutral-950 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none md:rounded-md"
              >
                <option value="none">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-border px-4 text-sm font-semibold text-muted hover:bg-neutral-900 hover:text-neutral-100 md:rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!draft.title.trim() || saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-black disabled:opacity-50 md:rounded-md"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
