// Login lives outside the (app) route group so the bottom tab bar does NOT
// render here. The AuthProvider is mounted in the root layout, so useAuth()
// still works inside this subtree.

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-10 sm:pt-16">
        {children}
      </main>
    </div>
  );
}
