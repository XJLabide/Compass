"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

/**
 * MiniChart — minimal "sparkline" line chart for the dashboard Trends grid.
 *
 * No axes, no grid, no tooltip — just a smooth line over the supplied
 * sequence of numeric values. Caller is responsible for projecting raw data
 * (kg, g, h, etc.) into a `{ x, y }` series in display units.
 *
 * The fixed `h-16` container guarantees a stable layout footprint regardless
 * of the data length, eliminating the layout shift the dashboard spec calls
 * out as a regression risk.
 */
export interface MiniChartPoint {
  /** Categorical x value — typically `localDate`. We don't draw it, but
   * Recharts wants something stable to key off of. */
  x: string;
  /** Numeric y value to plot, in whatever unit the parent chose. */
  y: number;
}

export interface MiniChartProps {
  data: MiniChartPoint[];
  /** Stroke color; defaults to the app accent (cyan). */
  color?: string;
}

export default function MiniChart({ data, color = "#22d3ee" }: MiniChartProps) {
  return (
    <div className="h-16 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 4, right: 2, left: 2, bottom: 4 }}
        >
          <Line
            type="monotone"
            dataKey="y"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
