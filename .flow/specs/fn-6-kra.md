# Dashboard — today CTAs, weekly stats, trend charts, recent PRs

## Overview
The first screen after sign-in. Single-column, stacked cards, mobile-first. Answers "what should I do today" and "am I on track for muscle gain". Auto rolls up data from sessions + daily check-ins; no separate "goals" page in v1.

## Scope
**In:**
- `/` route inside `(app)`
- Section order (top to bottom):
  1. **Today** — date header, "Log workout" CTA (with today scheduled session name or "Rest day"), "Daily check-in" CTA with completion badge
  2. **Goal banner** — bodyweight trend slope (last 4 weeks) vs target weekly gain. Color: green if within +/-25% of target, yellow if off, red if wrong direction.
  3. **This week** — counters: workouts done / planned, avg protein, avg sleep, weight delta this week vs last
  4. **Trends** — 4 mini line charts (last 8 weeks): bodyweight, weekly training volume (total weight x reps), protein daily avg, sleep daily avg
  5. **Recent PRs** — last 3 PRs with date and exercise
- Empty states per gap analyst: until 3 data points exist, replace charts with "Log your first workout"/"Add a weigh-in" CTAs. Show "-" not "0" when no data.
- Realtime listeners on this week + today only; trends are one-shot fetches (cached, refresh on focus)

**Out:**
- Multi-goal UI (v2)
- Habits / streaks (v2)
- To-do list (v2)
- Year-view heatmap (v2)

## Approach
- Compute weekly bodyweight slope with a simple linear regression over the last 4 weeks' entries (date-fns to bucket).
- Training volume per workout = sum(weight * reps) across all sets.
- Avoid expensive client computation by writing roll-up fields on `sessions` and `daily` docs as they are saved — but in v1 keep it dumb and compute client-side from the last 8 weeks of docs (~60 reads, fine for free tier).
- Charts: Recharts ResponsiveContainer + LineChart with no axes/gridlines on the mini variants for clarity.

## Quick commands
```bash
# Manual: dashboard with zero data shows empty-state CTAs only
# Manual: log a session + a check-in -> dashboard updates within ~1s (realtime)
```

## Acceptance
- [ ] Top of fold shows today's two CTAs without scrolling
- [ ] Goal banner shows correct color band for at-target / off / wrong-direction
- [ ] This-week counters update within 1s of finishing a session or check-in (realtime listener)
- [ ] Four mini charts render the last 8 weeks of data, no axes, no clutter
- [ ] Recent PRs strip shows last 3 PRs sorted by date desc
- [ ] First-run dashboard (no data) shows onboarding CTAs, not blank charts
- [ ] Zero-data weekly cells display "-" not "0"

## References
- Recharts: https://recharts.org/en-US/guide/getting-started
- date-fns bucketing: https://date-fns.org/v3.6.0/docs/startOfWeek
