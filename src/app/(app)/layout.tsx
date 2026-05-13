import BottomTabBar from "@/components/BottomTabBar";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-20 pt-6">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}
