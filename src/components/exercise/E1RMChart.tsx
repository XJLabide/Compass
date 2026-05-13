"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Dot,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { UnitSystem } from "@/lib/db/types";
import { kgToDisplay, weightUnitLabel } from "@/lib/workout/units";

/**
 * E1RMChart — Recharts line chart of estimated 1RM over time for a single
 * exercise.
 *
 * Data points come pre-computed by the parent page (one point per session
 * touching the exercise, with `e1rmKg` already Epley-derived from the
 * heaviest-scoring set of that session). We render:
 *
 *   - X axis: `localDate` (ISO `YYYY-MM-DD`), categorically ordered.
 *   - Y axis: e1RM in the user's display unit (kg or lb).
 *   - Line color: app accent.
 *   - PR markers: any point whose `isPR` flag is set renders as a larger
 *     filled dot. The flag is a hint from the parent (computed against the
 *     stored PR feed), not something we recompute here.
 *
 * The chart is intentionally dumb — it just visualizes whatever points the
 * parent passes. Filtering to "last 26 weeks" and PR marking both live in
 * the page so this component stays reusable for future views (e.g. an
 * "all-time" toggle in v2).
 */
export interface E1RMPoint {
  /** ISO `YYYY-MM-DD` — used as the X category. */
  localDate: string;
  /** Estimated 1RM in canonical kg. Converted at render time for display. */
  e1rmKg: number;
  /** Marks this session as having set a new e1RM PR. Renders a bigger dot. */
  isPR?: boolean;
  /** Session id — handy for future tooltip click-through, unused today. */
  sessionId?: string;
}

export interface E1RMChartProps {
  points: E1RMPoint[];
  unitSystem: UnitSystem;
}

/**
 * Custom dot renderer: bigger filled circle for PR sessions, small open
 * circle for regular sessions. Recharts passes `cx`, `cy`, and the payload.
 */
function E1RMDot(props: {
  cx?: number;
  cy?: number;
  payload?: { isPR?: boolean };
  index?: number;
}) {
  const { cx, cy, payload, index } = props;
  if (cx === undefined || cy === undefined) return null;
  const isPR = !!payload?.isPR;
  // Recharts requires a unique non-array key on each rendered dot or it warns
  // about list keys. Use the index it passes through.
  const key = `dot-${index ?? `${cx}-${cy}`}`;
  if (isPR) {
    return (
      <Dot
        key={key}
        cx={cx}
        cy={cy}
        r={5}
        fill="#facc15"
        stroke="#facc15"
        strokeWidth={1}
      />
    );
  }
  return (
    <Dot
      key={key}
      cx={cx}
      cy={cy}
      r={3}
      fill="#171717"
      stroke="#22d3ee"
      strokeWidth={1.5}
    />
  );
}

export default function E1RMChart({ points, unitSystem }: E1RMChartProps) {
  const unitLabel = weightUnitLabel(unitSystem);

  // Project to display units once. Recharts re-renders cheaply so this is
  // just a clarity win, not a perf one.
  const data = useMemo(
    () =>
      points.map((p) => ({
        localDate: p.localDate,
        e1rm: Number(kgToDisplay(p.e1rmKg, unitSystem).toFixed(1)),
        isPR: !!p.isPR,
      })),
    [points, unitSystem],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-neutral-900/40 text-sm text-muted">
        No e1RM data yet.
      </div>
    );
  }

  return (
    <div className="h-56 w-full rounded-xl border border-border bg-neutral-900/40 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
        >
          <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
          <XAxis
            dataKey="localDate"
            tick={{ fill: "#a3a3a3", fontSize: 10 }}
            stroke="#404040"
            // Sparse ticks for mobile: ~4 evenly spaced labels.
            interval={data.length > 5 ? Math.ceil(data.length / 4) - 1 : 0}
          />
          <YAxis
            tick={{ fill: "#a3a3a3", fontSize: 10 }}
            stroke="#404040"
            width={36}
            domain={["auto", "auto"]}
            unit={` ${unitLabel}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0a0a0a",
              border: "1px solid #404040",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#e5e5e5" }}
            formatter={(value: number) => [`${value} ${unitLabel}`, "e1RM"]}
          />
          <Line
            type="monotone"
            dataKey="e1rm"
            stroke="#22d3ee"
            strokeWidth={2}
            // Custom dot so PR sessions stand out.
            dot={<E1RMDot />}
            activeDot={{ r: 6, fill: "#22d3ee" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
