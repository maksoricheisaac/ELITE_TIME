import { AdminSidebar } from "@/components/ui/admin-sidebar";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { LogoutOverlay } from "@/components/customs/logout-overlay";
import { AiChatWidget } from "@/components/ai/AiChatWidget";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden">
          <div className="relative z-10 flex flex-1 flex-col gap-3 p-3 pt-2 sm:gap-4 sm:p-4 sm:pt-3">
            {children}
          </div>
          <LogoutOverlay />
        </div>
      </SidebarInset>
      {/* Assistant IA flottant — disponible sur toutes les pages de l'app */}
      <AiChatWidget />
    </SidebarProvider>
  );
}
