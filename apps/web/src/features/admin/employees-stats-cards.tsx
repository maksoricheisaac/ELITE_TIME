import type { User, Department, Position } from "@/types/models";
import { StatCard } from "@/components/ui/stat-card";
import { BreakdownCard } from "@/components/ui/breakdown-card";

interface EmployeesStatsCardsProps {
  employees: User[];
  departments: Department[];
  positions: Position[];
}

const ROLE_LABELS: Record<string, string> = {
  employee: "Employé",
  manager: "Manager",
  team_lead: "Chef d'équipe",
  admin: "Administrateur",
};

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

  const roleRows = Object.entries(byRole)
    .filter(([role]) => role !== "team_lead")
    .map(([role, count]) => ({ label: ROLE_LABELS[role] ?? role, value: count }));

  const topDepartments = Object.entries(byDepartment)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([dept, count]) => ({ label: dept, value: count }));

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Total employés"
        value={totalEmployees}
        hint={`${departments.length} départements · ${positions.length} postes`}
      />
      <StatCard
        label="Employés actifs"
        value={activeEmployees}
        tone={inactiveEmployees > 0 ? "warning" : "success"}
        toneLabel={inactiveEmployees > 0 ? `${inactiveEmployees} inactif${inactiveEmployees > 1 ? "s" : ""}` : "Tous actifs"}
      />
      <BreakdownCard title="Répartition par rôle" rows={roleRows} />
      <BreakdownCard title="Top départements" rows={topDepartments} empty="Aucun département" />
    </div>
  );
}
