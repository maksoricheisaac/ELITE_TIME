"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, Shield, Activity, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PresenceChart } from "@/components/charts/presence-chart";
import { RetardChart } from "@/components/charts/retard-chart";
import { adminGetDashboardChartData } from "@/actions/admin/dashboard";
import { EmployeeReportDateRangeFilter } from "@/features/manager/employee-report-date-range-filter";

interface DepartmentStat {
  name: string;
  count: number;
}

interface ManagerDashboardStats {
  totalUsers: number;
  employees: number;
  managers: number;
  admins: number;
  activeToday: number;
  departments: DepartmentStat[];
}

interface ManagerDashboardClientProps {
  stats: ManagerDashboardStats;
}

type ManagerChartData = Awaited<ReturnType<typeof adminGetDashboardChartData>>;

function fromISODate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const statCards = (stats: ManagerDashboardStats) => [
  {
    label: "Total utilisateurs",
    value: stats.totalUsers,
    sub: `${stats.employees} emp · ${stats.managers} mgrs · ${stats.admins} admins`,
    icon: Users,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    accent: "bg-blue-600",
  },
  {
    label: "Employés",
    value: stats.employees,
    sub: "Comptes employés actifs",
    icon: UserCheck,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    accent: "bg-emerald-500",
  },
  {
    label: "Managers",
    value: stats.managers,
    sub: "Responsables d'équipe",
    icon: Shield,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
    accent: "bg-violet-500",
  },
  {
    label: "Actifs maintenant",
    value: stats.activeToday,
    sub: "En cours de travail",
    icon: Activity,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    accent: "bg-amber-500",
  },
];

export default function ManagerDashboardClient({ stats }: ManagerDashboardClientProps) {
  const searchParams = useSearchParams();

  const { from, to, periodLabel } = useMemo(() => {
    const fromParam = searchParams?.get("from") ?? undefined;
    const toParam = searchParams?.get("to") ?? undefined;

    const today = new Date();
    const defaultFrom = new Date();
    defaultFrom.setDate(today.getDate() - 30);
    defaultFrom.setHours(0, 0, 0, 0);
    today.setHours(23, 59, 59, 999);

    const fromDate = fromISODate(fromParam) ?? defaultFrom;
    const toDate = fromISODate(toParam) ?? today;

    const fromLabel = fromDate.toLocaleDateString("fr-FR");
    const toLabel = toDate.toLocaleDateString("fr-FR");

    let label = "Choisir une période";
    if (fromLabel && toLabel && fromLabel === toLabel) {
      label = fromLabel;
    } else if (fromLabel && toLabel) {
      label = `${fromLabel} – ${toLabel}`;
    }

    return { from: fromDate, to: toDate, periodLabel: label };
  }, [searchParams]);

  const [chartData, setChartData] = useState<ManagerChartData | null>(null);
  const [isChartLoading, setIsChartLoading] = useState(false);

  useEffect(() => {
    if (!stats) return;
    let cancelled = false;
    const load = async () => {
      setIsChartLoading(true);
      try {
        const data = await adminGetDashboardChartData(from.toISOString(), to.toISOString());
        if (!cancelled) setChartData(data);
      } catch {
        if (!cancelled) setChartData({ presence: [], retards: [] });
      } finally {
        if (!cancelled) setIsChartLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [stats, from, to]);

  if (!stats) return null;

  const { employees, departments } = stats;
  const cards = statCards(stats);

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vue d&apos;ensemble de votre équipe</p>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[260px]">
          <EmployeeReportDateRangeFilter />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Card key={i} className="relative overflow-hidden border-border/50 py-0">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      {card.label}
                    </p>
                    <p className="text-3xl font-bold tabular-nums">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{card.sub}</p>
                  </div>
                  <div className={`rounded-xl p-2.5 shrink-0 ${card.bg}`}>
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
                <div className="mt-4 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${card.accent} opacity-70`}
                    style={{ width: `${Math.min(100, (card.value / Math.max(stats.totalUsers, 1)) * 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {isChartLoading && (
          <div className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground py-2">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Chargement des données…
          </div>
        )}
        <PresenceChart
          data={chartData?.presence ?? []}
          title="Présences"
          description={`Employés présents et absents · ${periodLabel}`}
        />
        <RetardChart
          data={chartData?.retards ?? []}
          title="Retards"
          description={`Retards enregistrés · ${periodLabel}`}
        />
      </div>

      <Card className="py-0">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="rounded-lg bg-muted p-1.5">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Répartition par service</h3>
              <p className="text-xs text-muted-foreground">{departments.length} départements</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {departments.map((dept) => {
              const pct = employees > 0 ? Math.round((dept.count / employees) * 100) : 0;
              return (
                <div key={dept.name} className="space-y-1.5 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{dept.name}</span>
                    <Badge variant="secondary" className="text-xs tabular-nums shrink-0 ml-1">{dept.count}</Badge>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border">
                    <div
                      className="h-1.5 rounded-full bg-primary/70 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{pct}% des employés</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
