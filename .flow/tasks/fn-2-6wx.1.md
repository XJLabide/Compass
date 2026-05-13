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
Added HMR-safe Firebase client singleton (src/lib/firebase.ts) with lazy env validation, a `"use client"` AuthProvider exposing `{ user, loading, signInGoogle, signInEmail, signOut }` with browserLocalPersistence and PWA-aware popup/redirect, a `useAuth` hook, and mounted the provider in the root layout. Typecheck + lint green; codex impl-review SHIP.
## Evidence
- Commits: 64ccde4d23593f53dc814cc4d1a44cb0824ff436, 18fad39175a081082eac21332c0ace9210d369cd
- Tests: npm run typecheck, npm run lint
- PRs: