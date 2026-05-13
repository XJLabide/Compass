## Description
Add the client-side auth gate inside the `(app)` route group, the allowlist check after sign-in, the `/not-authorized` page, and surface a sign-out action on the placeholder Settings page.

**Size:** M
**Files:** edit `src/app/(app)/layout.tsx` (gate logic), `src/app/not-authorized/page.tsx`, edit `src/app/(app)/settings/page.tsx` (sign-out button), `src/lib/auth/allowlist.ts`

## Approach
- Allowlist: read `NEXT_PUBLIC_ALLOWED_EMAILS` (comma-separated, lowercased) and expose `isAllowed(email)`.
- Gate behavior: while `loading`, render a centered spinner; if signed-out, `router.replace('/login')`; if signed-in but `!isAllowed(user.email)`, call `signOut()` then `router.replace('/not-authorized')`.
- `/not-authorized` page: explains the situation, offers "Try a different account" -> sign-out + back to `/login`.

## Acceptance
- [ ] Visiting `/` while signed-out lands on `/login` after the loading flicker
- [ ] Signing in with a non-allowlisted email lands on `/not-authorized` (signed out)
- [ ] Sign-out from Settings returns to `/login`
- [ ] No `useAuth()` call inside a server component

## Done summary
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
