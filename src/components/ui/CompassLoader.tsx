"use client";

import Image from "next/image";
import clsx from "clsx";
import Skeleton from "@/components/ui/Skeleton";

export interface CompassLoaderProps {
  /** Size variant of the brand mark */
  size?: "sm" | "md" | "lg" | "xl";
  /** Layout mode: inline badge, card skeleton replacement, or fullscreen overlay */
  mode?: "inline" | "card" | "fullscreen";
  /** Optional descriptive label displayed beneath the brand mark */
  label?: string;
  className?: string;
}

const SIZE_MAP = {
  sm: { width: 30, height: 20, className: "h-5 w-[30px]" },
  md: { width: 54, height: 36, className: "h-9 w-[54px]" },
  lg: { width: 84, height: 56, className: "h-14 w-[84px]" },
  xl: { width: 132, height: 88, className: "h-[88px] w-[132px]" },
};

/**
 * Branded loader.
 * Fullscreen mode renders a PWA-style splash screen; smaller modes keep a calm
 * static mark so loading states do not feel like a tool spinner.
 */
export default function CompassLoader({
  size = "md",
  mode = "card",
  label = "Navigating...",
  className,
}: CompassLoaderProps) {
  const sizeConfig = SIZE_MAP[size];
  const mark = (
    <Image
      src="/logo.png"
      alt="Compass"
      width={sizeConfig.width}
      height={sizeConfig.height}
      priority={mode === "fullscreen"}
      unoptimized
      className={clsx("shrink-0 object-contain", sizeConfig.className)}
    />
  );

  if (mode === "inline") {
    return (
      <span className={clsx("inline-flex items-center gap-2 text-xs text-muted", className)}>
        {mark}
        {label && <span className="font-medium text-neutral-300">{label}</span>}
      </span>
    );
  }

  if (mode === "fullscreen") {
    return (
      <div
        className={clsx(
          "fixed inset-0 z-50 flex min-h-dvh flex-col items-center justify-center bg-black px-8 text-center",
          className,
        )}
      >
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-splash-mark">{mark}</div>
        </div>
        <div className="pb-[calc(env(safe-area-inset-bottom)+2.25rem)] text-sm tracking-tight">
          <span className="font-medium text-neutral-500">made by </span>
          <span className="font-black uppercase tracking-[-0.02em] text-neutral-100">
            Xander
          </span>
        </div>
      </div>
    );
  }

  // Default: mode === "card"
  return (
    <div
      className={clsx(
        "rounded-lg border border-border/60 bg-neutral-900/40 p-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Image
          src="/logo.png"
          alt=""
          width={42}
          height={28}
          unoptimized
          className="h-7 w-[42px] shrink-0 object-contain"
        />
        {label ? (
          <span className="text-xs font-medium text-muted">{label}</span>
        ) : null}
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-4 w-2/3 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-5/6 rounded-md" />
      </div>
    </div>
  );
}
