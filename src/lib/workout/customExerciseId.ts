/**
 * Shared helpers for generating collision-proof custom-exercise document ids.
 *
 * Why this matters:
 *   The Firestore document at `users/{uid}/exercises/{id}` is keyed by a slug
 *   derived from the user-typed name. If we used a plain slug (e.g.
 *   `bench-press`) it would collide with a master/seeded exercise of the same
 *   id and the user's custom doc would silently shadow the master via setDoc.
 *
 *   `generateCustomId` appends a short random uuid suffix so two users can
 *   each create "Hack Squat" without collision and a user creating a custom
 *   "Bench Press" doesn't shadow the master `bench-press`.
 *
 * Note: keep the slug truncation at 60 chars so the final id (slug + "-" + 6)
 * stays under Firestore's document id soft cap. Don't change the suffix
 * length or format — existing user IDs on Firestore depend on this shape.
 */

/** Slugify a free-form name into a stable id prefix. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Generate a custom-exercise id: `slug + "-" + 6 hex chars from a UUID`.
 *
 * Uses `crypto.randomUUID` when available (modern browsers + Node 19+) and
 * falls back to `Date.now() + Math.random()` so this is safe to call from
 * any client-side context. Never call from a server route handler — the
 * picker is client-only.
 */
export function generateCustomId(name: string): string {
  const slug = slugify(name) || "exercise";
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const suffix = uuid.replace(/-/g, "").slice(0, 6);
  return `${slug}-${suffix}`;
}
