## Description
Build the `/login` page: Google sign-in button and an email/password sign-in form. Detect PWA standalone mode and use `signInWithRedirect` instead of popup (per practice-scout).

**Size:** M
**Files:** `src/app/login/page.tsx`, `src/app/login/layout.tsx` (provider only, no tab bar), `src/components/auth/EmailPasswordForm.tsx`, `src/components/auth/GoogleSignInButton.tsx`

## Approach
- `useAuth()` for sign-in actions.
- Standalone detection: `window.matchMedia('(display-mode: standalone)').matches` -> redirect flow.
- Inline error display under the form for `auth/wrong-password`, `auth/invalid-email`, `auth/popup-blocked`, network errors.
- No sign-up CTA — allowlist gates new accounts; users with no allowlisted email see `/not-authorized` after sign-in.

## Acceptance
- [ ] Google button signs in via popup on desktop, redirect when PWA-standalone
- [ ] Email/password form validates email shape before submit
- [ ] Error messages show inline, do not toast
- [ ] After successful sign-in, route to `/`
- [ ] Page renders cleanly on 375px viewport, no overflow

## Done summary
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
