/**
 * Tool definitions for Nori.
 *
 * These are passed to the LLM (OpenRouter / Claude Haiku 4.5) so it knows
 * what actions it can propose. Each entry contains an OpenAI-style JSON
 * schema for the LLM, plus metadata used by the client-side executor
 * (`isWrite` decides whether to show a confirmation dialog).
 */

export interface ToolDef {
  name: string;
  description: string;
  /** OpenAI-compatible JSON schema for the args. */
  parameters: Record<string, unknown>;
  /** Read tools auto-run; write tools require user confirmation. */
  isWrite: boolean;
  /** Short human label used in the confirmation card and history. */
  confirmLabel?: string;
}

const isoDate = {
  type: "string",
  description: "YYYY-MM-DD in the user's local timezone.",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
};

export const NORI_TOOLS: ToolDef[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "list_todos",
    description:
      "List the user's todos. Filter by status (open/done/all). Returns title, dueDate, recurrence, done, completedAt for each.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "done", "all"],
          description: "Default 'open'.",
        },
        limit: {
          type: "number",
          description: "Max rows to return. Default 50.",
        },
      },
    },
    isWrite: false,
  },
  {
    name: "list_routines",
    description:
      "List the user's tracked habits (routines). Returns name, weekdays (0=Sun..6=Sat), active flag, current streak, best streak, and whether done today.",
    parameters: { type: "object", properties: {} },
    isWrite: false,
  },
  {
    name: "list_expenses",
    description:
      "List expenses or income for a month. Returns amount, kind, category, note, date.",
    parameters: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description:
            "YYYY-MM. Omit for the current month. Use 'YYYY-MM-DD' to focus on a single day.",
        },
        kind: {
          type: "string",
          enum: ["expense", "income", "all"],
          description: "Default 'all'.",
        },
      },
    },
    isWrite: false,
  },
  {
    name: "get_check_in",
    description:
      "Read a daily check-in (bodyweight, sleep, mood, water, calories, protein, notes, reflection) for a specific date.",
    parameters: {
      type: "object",
      properties: { date: isoDate },
      required: ["date"],
    },
    isWrite: false,
  },
  {
    name: "list_recent_workouts",
    description:
      "Return the user's most recent workout sessions with name, date, total set count, and a brief set summary.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Default 5, max 20." },
      },
    },
    isWrite: false,
  },
  {
    name: "summary",
    description:
      "Get a multi-domain summary across todos, routines, money, check-in, and workouts for the user's day, week, or month.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["today", "week", "month"],
          description: "Default 'today'.",
        },
      },
    },
    isWrite: false,
  },

  // -------------------------------------------------------------------------
  // WRITE — every one of these requires user confirmation in the UI.
  // -------------------------------------------------------------------------
  {
    name: "add_todo",
    description: "Create a new todo.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Required. Max 500 chars." },
        dueDate: { ...isoDate, description: "Optional due date." },
        recurrence: {
          type: "string",
          enum: ["none", "daily", "weekly"],
          description: "Default 'none'.",
        },
      },
      required: ["title"],
    },
    isWrite: true,
    confirmLabel: "Add todo",
  },
  {
    name: "complete_todo",
    description:
      "Mark a todo as done. Match by exact title (case-insensitive). If multiple match, the most-recently-created wins.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Exact title to match." },
      },
      required: ["title"],
    },
    isWrite: true,
    confirmLabel: "Complete todo",
  },
  {
    name: "add_expense",
    description:
      "Log an expense or income for the user's local date. Amount is in MAJOR units (e.g. 12.50 = $12.50).",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Major units, > 0." },
        kind: {
          type: "string",
          enum: ["expense", "income"],
          description: "Default 'expense'.",
        },
        category: {
          type: "string",
          description:
            "Built-in (food/groceries/transport/rent/utilities/entertainment/health/shopping/savings/other) or any user-defined category.",
        },
        note: { type: "string", description: "Optional short note." },
        date: {
          ...isoDate,
          description: "Default: today in user's tz.",
        },
      },
      required: ["amount"],
    },
    isWrite: true,
    confirmLabel: "Log expense",
  },
  {
    name: "add_routine",
    description: "Create a new tracked habit with a custom weekly schedule.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Habit name. Required." },
        weekdays: {
          type: "array",
          items: { type: "number", minimum: 0, maximum: 6 },
          description:
            "Days of week the habit runs: 0=Sun, 1=Mon, ..., 6=Sat. Required, at least one.",
        },
      },
      required: ["name", "weekdays"],
    },
    isWrite: true,
    confirmLabel: "Add routine",
  },
  {
    name: "check_routine",
    description:
      "Mark a routine as done for a given date (default: today). Pass the routine's name (case-insensitive match).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Routine name." },
        date: { ...isoDate, description: "Default: today." },
      },
      required: ["name"],
    },
    isWrite: true,
    confirmLabel: "Check off routine",
  },
  {
    name: "log_check_in",
    description:
      "Update the user's daily check-in. Pass any subset of fields. Merges with existing data for the date.",
    parameters: {
      type: "object",
      properties: {
        date: { ...isoDate, description: "Default: today." },
        bodyweight: {
          type: "number",
          description: "In user's unit (kg or lb); converted client-side.",
        },
        sleepHours: { type: "number" },
        sleepQuality: {
          type: "number",
          minimum: 1,
          maximum: 5,
        },
        calories: { type: "number" },
        proteinG: { type: "number" },
        waterMl: { type: "number" },
        steps: { type: "number" },
        mood: { type: "number", minimum: 1, maximum: 5 },
        note: { type: "string" },
        struggles: { type: "string" },
        wins: { type: "string" },
        planTomorrow: { type: "string" },
      },
    },
    isWrite: true,
    confirmLabel: "Save check-in",
  },
];

export type ToolName = (typeof NORI_TOOLS)[number]["name"];

/** OpenAI-format tool list suitable for inclusion in the chat completions request. */
export function openAIFormatTools() {
  return NORI_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function findTool(name: string): ToolDef | undefined {
  return NORI_TOOLS.find((t) => t.name === name);
}
