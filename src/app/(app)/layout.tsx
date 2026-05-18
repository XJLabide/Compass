import BottomTabBar from "@/components/BottomTabBar";
import Sidebar from "@/components/Sidebar";
import OfflineIndicator from "@/components/OfflineIndicator";
import SeedErrorBanner from "@/components/SeedErrorBanner";
import AuthGate from "@/components/auth/AuthGate";
import { SidebarProvider } from "@/lib/ui/sidebar-state";
import { UserDataProvider } from "@/lib/data/UserDataProvider";
import SidebarAwareMain from "@/components/SidebarAwareMain";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import QuickCaptureFab from "@/components/QuickCaptureFab";
import NotificationsManager from "@/components/NotificationsManager";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <UserDataProvider>
        <SidebarProvider>
          <div className="flex min-h-dvh flex-col">
            <OfflineIndicator />
            {/* Mobile bottom tab bar (md:hidden is handled inside the component) */}
            <BottomTabBar />
            {/* Desktop left sidebar (hidden below md inside the component) */}
            <Sidebar />
            {/* Main content: reads sidebar state to set left margin on md+ */}
            <SidebarAwareMain>
              <SeedErrorBanner />
              {children}
            </SidebarAwareMain>
            <QuickCaptureFab />
            <OnboardingWizard />
            <NotificationsManager />
          </div>
        </SidebarProvider>
      </UserDataProvider>
    </AuthGate>
  );
}
