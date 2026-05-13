# Auth — Firebase Auth + allowlist + protected shell

## Overview
Sign-in (Google + email/password) for the single allowlisted user. Client-side `AuthProvider` exposes the current user; an auth gate redirects unauthenticated visits to `/login`. Server-side enforcement lives in Firestore rules (E3). No SSR cookie sessions in v1 — kept lean per PRD §12; v2 may add `next-firebase-auth-edge` for middleware-level protection.

## Scope
**In:**
- `src/lib/firebase.ts` — singleton client init using existing `NEXT_PUBLIC_FIREBASE_*` envs
- `AuthProvider` context (loading / signed-in / signed-out states) + `useAuth()` hook
- `/login` page: Google sign-in button + email/password form (sign-in only, no sign-up UI — allowlist is the gate)
- iOS PWA fallback: `signInWithRedirect` when `display-mode: standalone`, else `signInWithPopup`
- Client-side auth gate inside `(app)` layout: redirect to `/login` if signed-out
- `/not-authorized` page for users whose email is not on the allowlist (sign-out + retry)
- Sign-out action surfaced in the placeholder Settings page

**Out:**
- Allowlist enforcement in security rules (lives in E3)
- Sign-up flow (single-user app)
- Password reset (v2)
- Cookie/SSR session (v2)

## Approach
- Singleton init: `getApps().length ? getApp() : initializeApp(...)` per practice-scout — survives HMR.
- Client-only imports: keep `firebase/auth` out of server components; wrap provider in a `"use client"` boundary.
- Allowlist source: read `NEXT_PUBLIC_ALLOWED_EMAILS` (comma-separated). After successful sign-in, if `user.email` not in list, call `signOut()` and route to `/not-authorized`.
- Persistence: default `browserLocalPersistence`.
- Error UX: invalid credentials, network errors, popup-blocked, surfaced inline under the form.

## Quick commands
```bash
npm run dev
# Sign in via Google -> land on dashboard
# Sign in with non-allowlisted email -> land on /not-authorized
```

## Acceptance
- [ ] Visiting `/` while signed-out redirects to `/login`
- [ ] Google sign-in succeeds and lands on `/`
- [ ] Email/password sign-in succeeds for allowlisted credentials
- [ ] Non-allowlisted email is signed out and shown `/not-authorized`
- [ ] Refreshing the page keeps the session (persistence works)
- [ ] No Firebase code imports inside any server component
- [ ] Typecheck + lint + build remain green

## References
- Firebase Web v10 setup: https://firebase.google.com/docs/web/setup
- Google sign-in: https://firebase.google.com/docs/auth/web/google-signin
- Email/password: https://firebase.google.com/docs/auth/web/password-auth
- Auth persistence: https://firebase.google.com/docs/auth/web/auth-state-persistence
