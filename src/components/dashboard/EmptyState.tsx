import Link from "next/link";

/**
 * Small CTA card used as a placeholder when there isn't enough data to render
 * a meaningful widget yet (e.g. <3 bodyweight points for the trend banner).
 *
 * Mobile-first: full-width card with a single inline CTA. Renders as a
 * `<Link>` when `href` is set, otherwise a plain `<div>` for static copy.
 */
export interface EmptyStateProps {
  title: string;
  description?: string;
  ctaLabel?: string;
  href?: string;
}

export default function EmptyState({
  title,
  description,
  ctaLabel,
  href,
}: EmptyStateProps) {
  const body = (
    <>
      <div className="text-sm font-medium text-neutral-100">{title}</div>
      {description ? (
        <div className="mt-0.5 text-xs text-muted">{description}</div>
      ) : null}
      {ctaLabel ? (
        <span className="mt-2 inline-flex text-xs font-medium text-accent">
          {ctaLabel} ›
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl border border-dashed border-border bg-neutral-900/30 px-4 py-3 active:bg-neutral-800/40"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-neutral-900/30 px-4 py-3">
      {body}
    </div>
  );
}
