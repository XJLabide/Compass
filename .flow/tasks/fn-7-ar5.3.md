## Description
PWA polish: real 192/512 icons + apple-touch-icon, custom install prompt UX, full safe-area audit, Lighthouse mobile PWA score >= 90.

**Size:** M
**Files:** `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `src/components/InstallPrompt.tsx`, edit `src/app/(app)/settings/page.tsx`, audit edits across components

## Approach
- Icons: simple branded mark, transparent/dark background variants per Apple/Android guidance.
- Install prompt: capture `beforeinstallprompt`, stash event, surface "Install app" button in Settings. iOS detection: render manual "Add to Home Screen" hint.
- Hide install UI when `display-mode: standalone` matches.
- Safe-area audit: every `fixed`/`sticky` element gets `env(safe-area-inset-*)` where appropriate.

## Acceptance
- [ ] Lighthouse mobile (incognito) PWA score >= 90 on the deployed URL
- [ ] Chrome address bar shows install affordance
- [ ] Settings "Install" button installs the app
- [ ] iOS Safari hint appears for non-installed standalone-capable browsers
- [ ] No element overlaps the iOS home indicator

## Done summary
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
