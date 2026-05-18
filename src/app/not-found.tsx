import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-dvh px-4 py-16">
      <div className="mx-auto max-w-md text-center">
        <p className="text-sm font-medium text-accent">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-100">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md border border-border bg-panel px-4 py-2 text-sm font-medium text-neutral-100 hover:border-accent"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
