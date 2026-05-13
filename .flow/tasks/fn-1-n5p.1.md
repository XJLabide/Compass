## Description
Create the Next.js 14 App Router skeleton under `src/`. Add `globals.css` with Tailwind directives plus base body styles using the dark palette already in `tailwind.config.ts`. Stand up the root `layout.tsx` (html / body / metadata defaults) and a temporary home `page.tsx`.

**Size:** S
**Files:** `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/not-found.tsx`

## Approach
- Tailwind tokens (`bg`, `panel`, `border`, `accent`, `accent2`, `muted`) come from `tailwind.config.ts` — use them, no arbitrary hex.
- Body defaults: `bg-bg text-neutral-100 antialiased`, system font stack already configured.
- `metadata` exports: title "Personal Tracker", description from PRD vision.

## Acceptance
- [ ] `npm run dev` renders `/` with dark background and Tailwind classes working
- [ ] No `pages/` dir exists; all routes under `src/app/`
- [ ] `not-found.tsx` renders something readable
- [ ] `npm run typecheck` and `npm run build` succeed

## Done summary
Scaffolded the Next.js 14 App Router skeleton under `src/app/`: root `layout.tsx` with PRD-vision metadata, `globals.css` wiring Tailwind directives and dark-token body defaults, a temporary `page.tsx`, and a readable `not-found.tsx`. `npm run typecheck` and `npm run build` both pass; codex review verdict SHIP.
## Evidence
- Commits: 783ab62, 669a5b879ae579654cfde46decca263436c4298b
- Tests: npm run typecheck, npm run build
- PRs: