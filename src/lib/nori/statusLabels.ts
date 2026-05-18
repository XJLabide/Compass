/**
 * Friendly status labels keyed by tool name. Shown in the chat status pill
 * while a tool is queued/executing so the user sees what Nori is doing
 * instead of a generic spinner.
 */
const LABELS: Record<string, string> = {
  // Reads
  list_todos: "Checking your todos…",
  list_routines: "Looking at your routines…",
  list_expenses: "Pulling your expenses…",
  get_check_in: "Reading your check-in…",
  list_recent_workouts: "Reviewing recent workouts…",
  summary: "Building a summary…",
  // Writes
  add_todo: "Adding the todo…",
  complete_todo: "Marking it done…",
  add_expense: "Logging the entry…",
  add_routine: "Setting up the routine…",
  check_routine: "Checking it off…",
  log_check_in: "Saving your check-in…",
};

export function statusForTool(toolName: string): string {
  return LABELS[toolName] ?? `Running ${toolName}…`;
}

export const STATUS_THINKING = "Thinking…";
export const STATUS_STREAMING = "";
