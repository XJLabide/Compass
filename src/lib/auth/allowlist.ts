/**
 * Email allowlist for client-side gating.
 *
 * Reads `NEXT_PUBLIC_ALLOWED_EMAILS` (comma-separated). Comparison is
 * case-insensitive and ignores surrounding whitespace. The check is
 * intentionally simple — server-side enforcement (Firestore rules) is the
 * real security boundary; this gate just keeps non-allowlisted users out of
 * the app shell so they don't see a broken UI before rules reject them.
 */

function parseAllowed(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

const ALLOWED = parseAllowed(process.env.NEXT_PUBLIC_ALLOWED_EMAILS);

export function getAllowedEmails(): readonly string[] {
  return ALLOWED;
}

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return ALLOWED.includes(normalized);
}
