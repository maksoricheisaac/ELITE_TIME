
import { requireNavigationAccessById } from '@/lib/navigation-guard';
import { AccessControl } from '@/lib/security/access-control';
import { serverGet } from '@/lib/server-api';
import type { Department, User } from '@/types/models';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DepartmentsTable, { type DepartmentWithEmployeeCount } from '@/features/admin/departments-table';
import { DepartmentsStatsCards } from '@/features/admin/departments-stats-cards';
import { DepartmentsSearchForm } from '@/features/admin/departments-search-form';
import { DepartmentsCreateDialog } from '@/features/admin/departments-create-dialog';
import { PageHeader } from '@/components/ui/page-header';
import {
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '@/actions/admin/departments';

export default async function AppDepartmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  await requireNavigationAccessById('departements');

  const [canCreate, canEdit, canDelete] = await Promise.all([
    AccessControl.can('departments.create'),
    AccessControl.can('departments.edit'),
    AccessControl.can('departments.delete'),
  ]);

  const search = ((await searchParams)?.q || '').trim().toLowerCase();

  const [departments, usersData] = await Promise.all([
    serverGet<Department[]>('/departments'),
    serverGet<{ users: User[] }>('/users?status=active&limit=1000'),
  ]);

  const allEmployees: User[] = Array.isArray(usersData) ? usersData : ((usersData as { users?: User[] })?.users ?? []);

  const totalEmployees = allEmployees.length;
  const activeEmployees = allEmployees.filter((e) => e.status === 'active').length;
  const inactiveEmployees = allEmployees.filter((e) => e.status === 'inactive').length;

  const deptCountMap = new Map<string, number>();
  for (const emp of allEmployees) {
    if (emp.department) {
      deptCountMap.set(emp.department, (deptCountMap.get(emp.department) ?? 0) + 1);
    }
  }

  const employeesByDepartment = Array.from(deptCountMap.entries()).map(([dept, count]) => ({
    department: dept,
    _count: { _all: count },
  }));

  const departmentsWithCounts: DepartmentWithEmployeeCount[] = (departments as Department[]).map(
    (department) => ({
      ...department,
      employeesCount: deptCountMap.get(department.name) ?? 0,
    }),
  );

  const filteredDepartments = departmentsWithCounts.filter((department) => {
    if (!search) return true;
    return (
      department.name.toLowerCase().includes(search) ||
      (department.description || '').toLowerCase().includes(search)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Départements"
        title="Départements"
        description="Gérez les départements et visualisez le nombre d'employés associés."
      />

      <DepartmentsStatsCards
        departments={departments as Department[]}
        employeesByDepartment={employeesByDepartment}
        totalEmployees={totalEmployees}
        activeEmployees={activeEmployees}
        inactiveEmployees={inactiveEmployees}
      />

      <Card className="border-border/50 py-0">
        <CardHeader className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between border-b border-border/40">
          <div>
            <CardTitle className="text-base">Liste des départements</CardTitle>
            <CardDescription className="mt-0.5">
              Vue d&apos;ensemble des départements et du nombre d&apos;employés associés
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 w-full sm:w-auto">
            <div className="w-full sm:w-64">
              <DepartmentsSearchForm initialQuery={(await searchParams)?.q || ''} />
            </div>
            {canCreate && <DepartmentsCreateDialog action={createDepartment} />}
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <DepartmentsTable
            data={filteredDepartments}
            onUpdateDepartment={updateDepartment}
            onDeleteDepartment={deleteDepartment}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </CardContent>
      </Card>
    </div>
  );
}
