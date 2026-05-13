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
PWA polish: branded P-mark icons (192/512/180) on dark bg, new InstallPrompt component with iOS fallback mounted in Settings, safe-area audit (main padding, offline indicator top, QuickAdd bottom-sheet), and Lighthouse >=90 verification section appended to docs/DEPLOYMENT.md.
## Evidence
- Commits: 0d2a388abf5b1f6b867efbda0c1b158b1d3e3d65
- Tests: npm run typecheck (src clean; pre-existing test/ TS noise unrelated), npm run lint (clean)
- PRs: