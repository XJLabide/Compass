import clsx from "clsx";
import type { HTMLAttributes } from "react";

/**
 * Tiny shimmer placeholder. Avoid layout shift by giving callers explicit
 * height/width via className.
 */
export default function Skeleton({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={clsx(
        "animate-pulse rounded bg-neutral-800/70",
        className,
      )}
      {...rest}
    />
  );
}
