import clsx from "clsx";
import type { HTMLAttributes } from "react";

/**
 * Shimmer placeholder. Preserves exact caller height and width without layout shifts.
 */
export default function Skeleton({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={clsx(
        "animate-pulse rounded-lg bg-neutral-800/60 border border-border/20",
        className,
      )}
      {...rest}
    />
  );
}
