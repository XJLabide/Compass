export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold text-neutral-100">
          Personal Tracker
        </h1>
        <p className="mt-2 text-sm text-muted">
          Mobile-first workouts, check-ins, and progress over time.
        </p>
        <div className="mt-6 rounded-lg border border-border bg-panel p-4">
          <p className="text-sm text-neutral-300">
            Foundation skeleton is online. The app shell, tab bar, and routes
            land in the next tasks.
          </p>
        </div>
      </div>
    </main>
  );
}
