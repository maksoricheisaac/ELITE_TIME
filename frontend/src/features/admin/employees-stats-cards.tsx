import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { User, Department, Position } from "@/types/models";
import { Users, UserCheck, Building, Shield } from "lucide-react";

interface EmployeesStatsCardsProps {
  employees: User[];
  departments: Department[];
  positions: Position[];
}

export function EmployeesStatsCards({ employees, departments, positions }: EmployeesStatsCardsProps) {
  const realEmployees = employees.filter((e) => e.role === "employee");
  const totalEmployees = realEmployees.length;
  const activeEmployees = realEmployees.filter((e) => e.status === "active").length;
  const inactiveEmployees = realEmployees.filter((e) => e.status === "inactive").length;

  const byRole = employees.reduce((acc, e) => {
    acc[e.role] = (acc[e.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byDepartment = realEmployees.reduce((acc, e) => {
    const dept = e.department || "Non assigné";
    acc[dept] = (acc[dept] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const ROLE_LABELS: Record<string, string> = {
    employee: "Employé",
    manager: "Manager",
    team_lead: "Chef d'équipe",
    admin: "Administrateur",
  };

  const stats = [
    {
      label: "Total employés",
      value: totalEmployees,
      sub: `${departments.length} départements · ${positions.length} postes`,
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Employés actifs",
      value: activeEmployees,
      sub: inactiveEmployees > 0 ? `${inactiveEmployees} inactif(s)` : "Tous actifs",
      icon: UserCheck,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      valueColor: "text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Répartition par rôle */}
      <Card className="border-border/50 py-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Répartition rôles</p>
            </div>
            <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 p-2.5 shrink-0">
              <Shield className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
          </div>
          <div className="space-y-1.5">
            {Object.entries(byRole)
              .filter(([role]) => role !== "team_lead")
              .map(([role, count]) => (
                <div key={role} className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">
                    {ROLE_LABELS[role]}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums">{count as number}</span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Top département */}
      <Card className="border-border/50 py-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Top départements</p>
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-2.5 shrink-0">
              <Building className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          {Object.entries(byDepartment).length > 0 ? (
            <div className="space-y-1.5">
              {Object.entries(byDepartment)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 3)
                .map(([dept, count]) => (
                  <div key={dept} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate">{dept}</span>
                    <span className="text-sm font-semibold tabular-nums shrink-0 ml-2">{count as number}</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Aucun département</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
