/**
 * localStorage-backed "recently used" exercise ids, for the swap/add picker's
 * "Recent" section. Capped at the 10 most recent entries (most recent first).
 *
 * SSR-safe: every accessor guards `typeof window` and returns a sensible empty
 * default on the server.
 */

const KEY = "nori.workout.recentExercises";
const MAX = 10;

interface Entry {
  id: string;
  ts: number;
}

function safeParse(raw: string | null): Entry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is Entry =>
          !!e &&
          typeof e === "object" &&
          typeof (e as Entry).id === "string" &&
          typeof (e as Entry).ts === "number",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/**
 * Return the recent exercise ids, most recent first.
 * Returns `[]` on the server (no localStorage).
 */
export function getRecent(): string[] {
  if (typeof window === "undefined") return [];
  const entries = safeParse(window.localStorage.getItem(KEY));
  return entries.map((e) => e.id);
}

/**
 * Mark `exerciseId` as just-used. Moves to front if already present, trims to
 * `MAX` entries. No-op on the server.
 */
export function pushRecent(exerciseId: string): void {
  if (typeof window === "undefined") return;
  if (!exerciseId) return;
  const existing = safeParse(window.localStorage.getItem(KEY));
  const filtered = existing.filter((e) => e.id !== exerciseId);
  const next: Entry[] = [{ id: exerciseId, ts: Date.now() }, ...filtered].slice(
    0,
    MAX,
  );
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota errors, etc. — silently ignore; "recent" is non-load-bearing.
  }
}
