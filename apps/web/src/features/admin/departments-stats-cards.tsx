import type { Department } from "@/types/models";
import { StatCard } from "@/components/ui/stat-card";

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

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        label="Départements"
        value={departments.length}
        hint={`${departmentsWithEmployees} avec employés · ${departmentsWithoutEmployees} vide${departmentsWithoutEmployees > 1 ? "s" : ""}`}
      />
      <StatCard
        label="Collaborateurs"
        value={totalEmployees}
        hint={
          topDepartment
            ? `Plus grand : ${topDepartment.department as string} (${topDepartment._count._all}) · moy. ${avgEmployeesPerDepartment}`
            : `Moy. ${avgEmployeesPerDepartment} / département`
        }
      />
      <StatCard
        label="Actifs"
        value={activeEmployees}
        tone={inactiveEmployees > 0 ? "warning" : "success"}
        toneLabel={inactiveEmployees > 0 ? `${inactiveEmployees} inactif${inactiveEmployees > 1 ? "s" : ""}` : "Tous actifs"}
      />
    </div>
  );
}
