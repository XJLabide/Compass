// Login lives outside the (app) route group so the bottom tab bar does NOT
// render here. The AuthProvider is mounted in the root layout, so useAuth()
// still works inside this subtree.

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="relative min-h-dvh bg-bg">{children}</div>;
}
