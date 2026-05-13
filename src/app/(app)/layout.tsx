import BottomTabBar from "@/components/BottomTabBar";
import Sidebar from "@/components/Sidebar";
import OfflineIndicator from "@/components/OfflineIndicator";
import AuthGate from "@/components/auth/AuthGate";
import { SidebarProvider } from "@/lib/ui/sidebar-state";
import SidebarAwareMain from "@/components/SidebarAwareMain";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <SidebarProvider>
        <div className="flex min-h-screen flex-col">
          <OfflineIndicator />
          {/* Mobile bottom tab bar (md:hidden is handled inside the component) */}
          <BottomTabBar />
          {/* Desktop left sidebar (hidden below md inside the component) */}
          <Sidebar />
          {/* Main content: reads sidebar state to set left margin on md+ */}
          <SidebarAwareMain>{children}</SidebarAwareMain>
        </div>
      </SidebarProvider>
    </AuthGate>
  );
}
