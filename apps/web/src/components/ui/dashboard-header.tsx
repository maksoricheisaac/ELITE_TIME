"use client";

import { Fragment, memo, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "./toggle-mode";
import { UserNav } from "../customs/user-nav";
import { LateAlertsPanel } from "@/components/ui/late-alerts-panel";

export const PAGE_LABELS: Record<string, string> = {
  dashboard: "Tableau de bord",
  employees: "Employés",
  pointages: "Pointages",
  "mes-pointages": "Mes pointages",
  "mon-rapport": "Mon rapport",
  conges: "Congés",
  "mes-conges": "Mes congés",
  departements: "Départements",
  postes: "Postes",
  reports: "Rapports",
  logs: "Journal d'activité",
  permissions: "Permissions",
  "permissions-guide": "Guide des permissions",
  emails: "E-mails planifiés",
  settings: "Paramètres",
  profile: "Mon profil",
  manager: "Manager",
  manual: "Saisie manuelle",
};

const labelFor = (segment: string) =>
  PAGE_LABELS[segment] ??
  segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");

// Segments dynamiques (identifiants) : non affichés tels quels dans le fil d'Ariane
const isDynamicSegment = (s: string) => /^[a-z0-9_-]{20,}$/i.test(s) || /^c[a-z0-9]{24}$/.test(s);

export const DashboardHeader = memo(() => {
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState<string>("");

  const crumbs = pathname
    .split("/")
    .filter(Boolean)
    .reduce<{ href: string; label: string }[]>((acc, seg) => {
      const href = `${acc.length ? acc[acc.length - 1].href : ""}/${seg}`;
      acc.push({ href, label: isDynamicSegment(seg) ? "Détail" : labelFor(seg) });
      return acc;
    }, []);
  const trail = crumbs.length ? crumbs : [{ href: "/dashboard", label: PAGE_LABELS.dashboard }];

  useEffect(() => {
    const updateTime = () =>
      setCurrentTime(
        new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      );
    updateTime();
    const id = window.setInterval(updateTime, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center gap-2 border-b border-border bg-card">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <SidebarTrigger
          aria-label="Ouvrir ou fermer le menu"
          className="-ml-1 size-9 shrink-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        />
        <Separator orientation="vertical" className="h-4 shrink-0" />
        <nav aria-label="Fil d'Ariane" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-1 text-sm">
            {trail.map((c, i) => {
              const last = i === trail.length - 1;
              return (
                <Fragment key={c.href}>
                  {i > 0 && (
                    <ChevronRight
                      className="hidden size-3.5 shrink-0 text-muted-foreground sm:block"
                      aria-hidden="true"
                    />
                  )}
                  <li
                    className={
                      last
                        ? "min-w-0 truncate font-semibold text-foreground"
                        : "hidden text-muted-foreground sm:block"
                    }
                  >
                    {last ? (
                      <span aria-current="page">{c.label}</span>
                    ) : (
                      <Link href={c.href} prefetch={false} className="hover:text-foreground">
                        {c.label}
                      </Link>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        {currentTime && (
          <div className="hidden flex-col items-end sm:flex">
            <span className="tabular text-sm font-semibold leading-none">{currentTime}</span>
            <span className="text-[11px] text-muted-foreground">Heure locale</span>
          </div>
        )}
        <LateAlertsPanel />
        <div className="flex items-center gap-1">
          <UserNav />
          <ModeToggle />
        </div>
      </div>
    </header>
  );
});

DashboardHeader.displayName = "DashboardHeader";
