/**
 * `/workout` page hero card.
 *
 * Full-width, ~160px tall, rounded card with a gym photograph background and a
 * dark overlay for text contrast. No gradients (intentional — the spec calls
 * for solid colors only). The headline is a two-line affirmation with the
 * second line in the brand accent, plus a short accent underscore.
 *
 * We use a plain `<img>` rather than `next/image` so the hero renders
 * predictably during SSR without any layout shift quirks from the image
 * optimizer. The asset is small and `loading="eager"` so it's on-screen
 * essentially at first paint.
 */

const HERO_IMAGE_SRC =
  "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=1200&q=80";

export default function WorkoutHero() {
  return (
    <div className="relative isolate w-full overflow-hidden rounded-2xl border border-border bg-neutral-900 shadow-sm">
      {/* Background image — absolutely positioned so the overlay can stack
          above it without affecting layout. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={HERO_IMAGE_SRC}
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
      />
      {/* Dark overlay (solid color w/ opacity, NOT a gradient) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-black/55"
      />

      <div className="flex min-h-[160px] flex-col justify-center gap-2 px-5 py-6 sm:min-h-[180px] sm:px-7 sm:py-8">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-neutral-100 sm:text-3xl">
          Focus today.
        </h1>
        <p className="text-2xl font-semibold leading-tight tracking-tight text-accent sm:text-3xl">
          Stronger tomorrow.
        </p>
        <div
          aria-hidden="true"
          className="mt-2 h-[3px] w-[50px] rounded-full bg-accent"
        />
      </div>
    </div>
  );
}
