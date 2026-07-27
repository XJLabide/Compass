"use client";

import clsx from "clsx";

export interface CompassLoaderProps {
  /** Size variant of the compass mark */
  size?: "sm" | "md" | "lg" | "xl";
  /** Layout mode: inline badge, card skeleton replacement, or fullscreen overlay */
  mode?: "inline" | "card" | "fullscreen";
  /** Optional descriptive label displayed beneath the spinning compass */
  label?: string;
  className?: string;
}

const SIZE_MAP = {
  sm: "h-5 w-5",
  md: "h-9 w-9",
  lg: "h-14 w-14",
  xl: "h-20 w-20",
};

/**
 * Branded Spinning Compass Loader.
 *
 * Renders a vector compass mark with smooth outer ring rotation, magnetic
 * needle sway, glowing cyan gradients, and optional glassmorphic background modes.
 */
export default function CompassLoader({
  size = "md",
  mode = "card",
  label = "Navigating...",
  className,
}: CompassLoaderProps) {
  const compassSvg = (
    <div className="relative inline-flex items-center justify-center">
      {/* Outer ambient cyan aura */}
      <div
        className={clsx(
          "absolute inset-0 rounded-full bg-cyan-400/20 blur-md animate-compass-glow",
        )}
      />

      <svg
        viewBox="0 0 512 512"
        role="img"
        aria-label="Loading..."
        className={clsx("relative z-10 shrink-0", SIZE_MAP[size])}
      >
        <title>Loading...</title>
        <defs>
          {/* North-needle gradient */}
          <linearGradient id="compass-loader-needle" x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="#a5f3fc" />
            <stop offset="55%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>

          {/* Outer ring gradient */}
          <linearGradient id="compass-loader-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#0891b2" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.8" />
          </linearGradient>

          <filter id="compass-loader-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer Rotating Compass Ring with cardinal tick marks */}
        <g className="animate-compass-rotate">
          <circle
            cx="256"
            cy="256"
            r="230"
            fill="none"
            stroke="url(#compass-loader-ring)"
            strokeWidth="12"
            strokeDasharray="60 15 120 15"
          />
          <circle
            cx="256"
            cy="256"
            r="200"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="4"
            strokeOpacity="0.25"
          />
          {/* Cardinal points ticks */}
          <line x1="256" y1="26" x2="256" y2="46" stroke="#22d3ee" strokeWidth="8" strokeLinecap="round" />
          <line x1="256" y1="466" x2="256" y2="486" stroke="#22d3ee" strokeWidth="8" strokeLinecap="round" />
          <line x1="26" y1="256" x2="46" y2="256" stroke="#22d3ee" strokeWidth="8" strokeLinecap="round" />
          <line x1="466" y1="256" x2="486" y2="256" stroke="#22d3ee" strokeWidth="8" strokeLinecap="round" />
        </g>

        {/* Oscillating Magnetic Needles (North + South) */}
        <g className="animate-needle-sway">
          {/* North Arrow (Glowing Cyan gradient) */}
          <g filter="url(#compass-loader-glow)">
            <polygon
              points="256,58 310,234 256,256 202,234"
              fill="url(#compass-loader-needle)"
            />
          </g>

          {/* South Arrow (Subtle stroked outline) */}
          <polygon
            points="256,454 310,278 256,256 202,278"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="8"
            strokeLinejoin="round"
            opacity="0.6"
          />

          {/* Center Hub */}
          <circle cx="256" cy="256" r="16" fill="#0a0a0b" stroke="#22d3ee" strokeWidth="4" />
        </g>
      </svg>
    </div>
  );

  if (mode === "inline") {
    return (
      <span className={clsx("inline-flex items-center gap-2 text-xs text-muted", className)}>
        {compassSvg}
        {label && <span className="font-medium text-neutral-300">{label}</span>}
      </span>
    );
  }

  if (mode === "fullscreen") {
    return (
      <div
        className={clsx(
          "fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-neutral-950/80 backdrop-blur-md p-6 text-center",
          className,
        )}
      >
        {compassSvg}
        {label && (
          <p className="animate-pulse text-xs font-semibold uppercase tracking-widest text-cyan-300/90">
            {label}
          </p>
        )}
      </div>
    );
  }

  // Default: mode === "card"
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-border/60 bg-neutral-900/40 p-8 text-center",
        className,
      )}
    >
      {compassSvg}
      {label && (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted animate-pulse">
          {label}
        </span>
      )}
    </div>
  );
}
