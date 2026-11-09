"use client";

import { memo, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "./toggle-mode";
import { UserNav } from "../customs/user-nav";
import { LateAlertsPanel } from "@/components/ui/late-alerts-panel";

const PAGE_LABELS: Record<string, string> = {
  dashboard: "Tableau de bord",
  employees: "Employés",
  pointages: "Pointages",
  "mes-pointages": "Mes pointages",
  conges: "Congés",
  departements: "Départements",
  postes: "Postes",
  reports: "Rapports",
  logs: "Logs & activité",
  permissions: "Permissions",
  settings: "Paramètres",
  profile: "Mon profil",
  manager: "Manager",
  manual: "Saisie manuelle",
};

interface DashboardHeaderProps {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  isRefreshing?: boolean;
}

export const DashboardHeader = memo(({}: DashboardHeaderProps) => {
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState<string>("");

  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? "dashboard";
  const pageLabel =
    PAGE_LABELS[lastSegment] ??
    lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1).replace(/-/g, " ");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      );
    };
    updateTime();
    const id = window.setInterval(updateTime, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="bg-[var(--sidebar)] text-white sticky top-0 z-50 flex h-12 w-full shrink-0 items-center gap-2 border-b border-white/10 shadow-sm transition-[width,height] ease-linear sm:h-14 group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      {/* Left: trigger + page title */}
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <SidebarTrigger className="-ml-1 shrink-0 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors" />
        <Separator orientation="vertical" className="h-4 shrink-0 bg-white/20" />
        <motion.span
          key={pageLabel}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="truncate text-xs font-semibold text-white tracking-tight sm:text-sm"
        >
          {pageLabel}
        </motion.span>
      </div>

      {/* Right: time + alerts + user */}
      <div className="flex shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        {currentTime && (
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-semibold leading-none text-white">{currentTime}</span>
            <span className="text-[10px] uppercase tracking-wide text-white/60">Heure locale</span>
          </div>
        )}
        <LateAlertsPanel />
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-1"
        >
          <UserNav />
          <ModeToggle />
        </motion.div>
      </div>
    </header>
  );
});

DashboardHeader.displayName = "DashboardHeader";
