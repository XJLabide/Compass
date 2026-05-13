# M0 Foundation — Next.js scaffold, app shell, PWA basics

## Overview
Greenfield bootstrap. Stand up the Next.js 14 App Router project skeleton inside `src/`, Tailwind globals using the existing dark palette in `tailwind.config.ts`, a mobile-first app shell with a bottom tab bar, and the minimum PWA surface (manifest + viewport + theme color). No Firebase or business logic here — that's E2/E3.

## Scope
**In:**
- `src/app/` skeleton: `layout.tsx`, `page.tsx`, `globals.css`, `not-found.tsx`
- App shell: bottom tab navigation (Home / Workout / Check-in / History / Settings) with safe-area padding, sticky positioning, active-route highlight
- Route group `(app)` for screens that will later require auth; placeholder pages for each tab
- PWA: `app/manifest.ts`, `viewport` export with `viewportFit: 'cover'`, theme color, basic icons (placeholders OK)
- ESLint config (`.eslintrc.json` using `next/core-web-vitals`) so `npm run lint` works
- Verify `npm run build`, `npm run typecheck`, `npm run lint` all pass

**Out:**
- Firebase init (E2)
- Real screens beyond placeholders (E4/E5/E6)
- Service worker / install prompt (E7)
- Real PWA icons (E7)

## Approach
- Tailwind tokens already defined in `tailwind.config.ts` — use `bg`, `panel`, `border`, `accent`, `muted` only; no arbitrary hex.
- Path alias `@/*` → `./src/*` already in `tsconfig.json`.
- Bottom tab bar pattern per practice-scout: `fixed bottom-0 inset-x-0 pb-[env(safe-area-inset-bottom)] border-t`. Min-height 44px per touch target rule.
- Main content gets `pb-20` to reserve space under the tab bar.
- Single shared layout `src/app/(app)/layout.tsx` for the tabbed shell; `src/app/login/` will live outside the group (created in E2).

## Quick commands
```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run lint
npm run build
```

## Acceptance
- [ ] `npm install && npm run build` succeeds from scratch
- [ ] Home route renders inside the app shell with bottom tab bar visible
- [ ] All 5 tabs are clickable, active tab is visually distinguished
- [ ] Inspect mobile viewport (iPhone DevTools): no horizontal scroll, tab bar respects safe-area
- [ ] `npm run typecheck` and `npm run lint` both green
- [ ] Manifest is reachable at `/manifest.webmanifest` and validates

## References
- Tailwind config: `tailwind.config.ts`
- TS path alias: `tsconfig.json`
- Next.js App Router: https://nextjs.org/docs/14/app/building-your-application/routing
- PWA manifest: https://nextjs.org/docs/14/app/api-reference/file-conventions/metadata/manifest
- Viewport: https://nextjs.org/docs/14/app/api-reference/functions/generate-viewport
