import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Department } from "@/types/models";
import { Building, Users, UserCheck, TrendingUp, LayoutGrid } from "lucide-react";

interface DepartmentsStatsCardsProps {
  departments: Department[];
  employeesByDepartment: { department: string | null; _count: { _all: number } }[];
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
}

export function DepartmentsStatsCards({
  departments,
  employeesByDepartment,
  totalEmployees,
  activeEmployees,
  inactiveEmployees,
}: DepartmentsStatsCardsProps) {
  const departmentsWithEmployees = departments.filter((dept) =>
    employeesByDepartment.some((g) => g.department === dept.name && g._count._all > 0)
  ).length;

  const departmentsWithoutEmployees = departments.length - departmentsWithEmployees;

  const topDepartment = employeesByDepartment
    .filter((g) => g.department && g._count._all > 0)
    .sort((a, b) => b._count._all - a._count._all)[0];

  const avgEmployeesPerDepartment =
    departments.length > 0 ? Math.round((totalEmployees / departments.length) * 10) / 10 : 0;

  const stats = [
    {
      label: "Départements",
      value: departments.length,
      sub: `${departmentsWithEmployees} avec employés · ${departmentsWithoutEmployees} vides`,
      icon: Building,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Total employés",
      value: totalEmployees,
      sub: `Moy. ${avgEmployeesPerDepartment} / département`,
      icon: Users,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-900/20",
    },
    {
      label: "Actifs",
      value: activeEmployees,
      sub: inactiveEmployees > 0 ? `${inactiveEmployees} inactif(s)` : "Tous actifs",
      icon: UserCheck,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      valueColor: "text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <Card key={i} className="border-border/50 py-0">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {stat.label}
                  </p>
                  <p className={`text-3xl font-bold tabular-nums ${stat.valueColor ?? ""}`}>
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                </div>
                <div className={`rounded-xl p-2.5 shrink-0 ${stat.bg}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Top département */}
      <Card className="border-border/50 py-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top département</p>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-2.5 shrink-0">
              <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          {topDepartment ? (
            <>
              <p className="text-sm font-semibold truncate">{topDepartment.department as string}</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{topDepartment._count._all}</p>
              <p className="text-xs text-muted-foreground">employés</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">Aucun département avec employés</p>
          )}
        </CardContent>
      </Card>

      {/* Répartition */}
      <Card className="border-border/50 py-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Répartition</p>
            <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2.5 shrink-0">
              <LayoutGrid className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Avec employés</span>
              <Badge variant="success">{departmentsWithEmployees}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Vides</span>
              <Badge variant="secondary">{departmentsWithoutEmployees}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
