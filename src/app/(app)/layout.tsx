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
        <main
          className="mx-auto w-full max-w-md flex-1 px-4 pt-6"
          // Reserve room for the fixed 56px bottom tab bar plus the iOS home
          // indicator inset, so page content never sits underneath either.
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)",
          }}
        >
          {children}
        </main>
        <BottomTabBar />
      </div>
    </AuthGate>
  );
}
