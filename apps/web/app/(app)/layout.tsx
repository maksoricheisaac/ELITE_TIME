import { AdminSidebar } from "@/components/ui/admin-sidebar";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { LogoutOverlay } from "@/components/customs/logout-overlay";
import { AiChatWidget } from "@/components/ai/AiChatWidget";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <a href="#main-content" className="skip-link">
        Aller au contenu
      </a>
      <AdminSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden">
          <main
            id="main-content"
            tabIndex={-1}
            className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 p-4 outline-none sm:gap-6 sm:p-6"
          >
            {children}
          </main>
          <LogoutOverlay />
        </div>
      </SidebarInset>
      {/* Assistant IA flottant — disponible sur toutes les pages de l'app */}
      <AiChatWidget />
    </SidebarProvider>
  );
}
