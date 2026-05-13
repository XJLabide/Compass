import BottomTabBar from "@/components/BottomTabBar";
import OfflineIndicator from "@/components/OfflineIndicator";
import AuthGate from "@/components/auth/AuthGate";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <div className="flex min-h-screen flex-col">
        <OfflineIndicator />
        {/* Top nav visible on md+; bottom tab bar handles mobile (hidden md+).
            Both live in the component — BottomTabBar renders both variants
            and uses Tailwind responsive classes to swap between them. */}
        <BottomTabBar />
        <main
          className={[
            // Responsive container: mobile-first narrow, expands on larger screens.
            "mx-auto w-full max-w-md px-4 pt-6 flex-1",
            "md:max-w-3xl md:px-8 md:pt-8",
            "lg:max-w-5xl",
            "xl:max-w-6xl",
            // Mobile: pad bottom to clear the fixed 56px tab bar + iOS inset.
            // md+: top nav is in-flow; only need modest bottom breathing room.
            "pb-[calc(env(safe-area-inset-bottom)+5rem)]",
            "md:pb-12",
          ].join(" ")}
        >
          {children}
        </main>
      </div>
    </AuthGate>
  );
}
