## Description
Initialize the Firebase client SDK as a singleton, expose typed handles for `auth` and `db`, and build the `AuthProvider` React context plus `useAuth()` hook.

**Size:** M
**Files:** `src/lib/firebase.ts`, `src/lib/auth/AuthProvider.tsx`, `src/lib/auth/useAuth.ts`

## Approach
- Singleton: guard with `getApps().length ? getApp() : initializeApp(...)` to survive HMR (per practice-scout).
- `"use client"` boundary on the provider; mounted in `src/app/(app)/layout.tsx` and `/login` layout.
- Hook surface: `{ user, loading, signInGoogle, signInEmail, signOut }` — auth methods live here so screens don't import `firebase/auth` directly.
- Persistence: `browserLocalPersistence` set on init.

## Key context
- `NEXT_PUBLIC_FIREBASE_*` keys defined in `.env.local.example` — read them as the config object.
- Do NOT import `firebase/auth` in any server component file.

## Acceptance
- [ ] Provider returns `{ user: null, loading: true }` while initial auth state resolves
- [ ] After sign-in, `user` becomes the Firebase `User` object
- [ ] HMR during dev does not throw "Firebase app already initialized"
- [ ] Typecheck passes; no `any` exported from the module

## Done summary
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
