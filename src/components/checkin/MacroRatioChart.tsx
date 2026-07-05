"use client";

import { useMemo } from "react";

export interface MacroRatioChartProps {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export default function MacroRatioChart({
  proteinG = 0,
  carbsG = 0,
  fatG = 0,
}: MacroRatioChartProps) {
  const { totalCalories, proteinPct, carbsPct, fatPct, segments } = useMemo(() => {
    const pCals = proteinG * 4;
    const cCals = carbsG * 4;
    const fCals = fatG * 9;
    const total = pCals + cCals + fCals;

    if (total === 0) {
      return {
        totalCalories: 0,
        proteinPct: 0,
        carbsPct: 0,
        fatPct: 0,
        segments: [{ key: "empty", value: 100, color: "stroke-neutral-800", percentage: 100 }],
      };
    }

    const pPct = Math.round((pCals / total) * 100);
    const cPct = Math.round((cCals / total) * 100);
    const fPct = 100 - pPct - cPct; // Ensure totals sum exactly to 100%

    // Create segments for the SVG donut
    const activeSegments = [
      { key: "protein", value: pCals, color: "stroke-cyan-400", percentage: pPct },
      { key: "carbs", value: cCals, color: "stroke-amber-300", percentage: cPct },
      { key: "fat", value: fCals, color: "stroke-rose-400", percentage: fPct },
    ].filter((s) => s.value > 0);

    return {
      totalCalories: total,
      proteinPct: pPct,
      carbsPct: cPct,
      fatPct: fPct,
      segments: activeSegments,
    };
  }, [proteinG, carbsG, fatG]);

  // SVG parameters
  const radius = 36;
  const circumference = 2 * Math.PI * radius; // ~226.19

  // Calculate cumulative offsets
  let currentOffset = 0;

  return (
    <div className="flex items-center gap-6 rounded-xl border border-border/40 bg-neutral-950/40 p-4">
      {/* Donut Chart SVG */}
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          {segments.map((seg) => {
            const strokeDash = (seg.percentage / 100) * circumference;
            const strokeOffset = circumference - strokeDash + currentOffset;
            currentOffset -= strokeDash;

            return (
              <circle
                key={seg.key}
                cx="50"
                cy="50"
                r={radius}
                className={`fill-none ${seg.color} transition-[stroke-dasharray,stroke-dashoffset] duration-500 ease-out`}
                strokeWidth="10"
                strokeDasharray={`${strokeDash} ${circumference - strokeDash}`}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Split</span>
          <span className="text-xs font-extrabold text-neutral-200">
            {totalCalories > 0 ? `${Math.round(totalCalories)}` : "0"}
          </span>
          <span className="text-[8px] font-bold text-muted -mt-0.5">kcal</span>
        </div>
      </div>

      {/* Legend & Details */}
      <div className="flex-1 space-y-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted">
          Energy Ratio (% of kcal)
        </h4>

        {totalCalories === 0 ? (
          <p className="text-xs italic text-muted">
            Log foods to visualize your macronutrient split.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {/* Protein */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                <span className="text-[10px] font-bold text-neutral-300">Protein</span>
              </div>
              <p className="text-sm font-extrabold text-neutral-100 tabular-nums">
                {proteinPct}%
              </p>
              <p className="text-[9px] text-muted tabular-nums">
                {proteinG * 4} kcal
              </p>
            </div>

            {/* Carbs */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                <span className="text-[10px] font-bold text-neutral-300">Carbs</span>
              </div>
              <p className="text-sm font-extrabold text-neutral-100 tabular-nums">
                {carbsPct}%
              </p>
              <p className="text-[9px] text-muted tabular-nums">
                {carbsG * 4} kcal
              </p>
            </div>

            {/* Fat */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                <span className="text-[10px] font-bold text-neutral-300">Fat</span>
              </div>
              <p className="text-sm font-extrabold text-neutral-100 tabular-nums">
                {fatPct}%
              </p>
              <p className="text-[9px] text-muted tabular-nums">
                {fatG * 9} kcal
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
