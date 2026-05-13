export default function HomePage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-neutral-100">Home</h1>
      <p className="mt-2 text-sm text-muted">
        Mobile-first workouts, check-ins, and progress over time.
      </p>
      <div className="mt-6 rounded-lg border border-border bg-panel p-4">
        <p className="text-sm text-neutral-300">
          Foundation app shell is online. Real dashboard content lands in later
          epics.
        </p>
      </div>
    </section>
  );
}
