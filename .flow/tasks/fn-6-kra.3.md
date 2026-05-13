## Description
Trends section: four mini line charts (bodyweight, weekly training volume, protein daily avg, sleep daily avg) over the last 8 weeks.

**Size:** M
**Files:** `src/components/dashboard/Trends.tsx`, `src/components/dashboard/MiniChart.tsx`, `src/lib/dashboard/trends.ts`

## Approach
- One-shot fetch of last 8 weeks of `daily/*` and `sessions/*`; cache per session, refetch on tab focus.
- MiniChart: Recharts `ResponsiveContainer` + `LineChart` with no axes/grid, just the line.
- Training volume per session = sum(set.weightKg * set.reps); aggregate per week.

## Acceptance
- [ ] Each mini chart renders with smooth line, no clutter
- [ ] Empty state: "Log 3 entries to see your trend" placeholder when <3 data points
- [ ] Tab focus refreshes data
- [ ] No layout shift when charts render

## Done summary
Added dashboard Trends section: 4 mini line charts (bodyweight, weekly volume, protein, sleep) over the last 8 weeks with one-shot fetch + tab-focus refresh and a <3-point empty state. Mounted between ThisWeekCard and RecentPRsStrip.
## Evidence
- Commits: 5e2834dc3e7e089cc828d39500808ab1e08533ee
- Tests: npx tsc --noEmit, npx next lint
- PRs: