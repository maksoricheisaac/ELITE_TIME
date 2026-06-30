
export const dynamic = 'force-dynamic';

import type { User, Department, Position } from '@/types/models';
import { requireNavigationAccessById } from '@/lib/navigation-guard';
import { EmployeesUpdateNotifier } from '@/features/admin/employees-update-notifier';
import { EmployeesSyncNotifier } from '@/features/admin/employees-sync-notifier';
import { EmployeesStatsCards } from '@/features/admin/employees-stats-cards';
import EmployeesTable from '@/features/admin/employees-table';
import { updateEmployee, syncEmployeesFromLdap, adminSoftDeleteEmployee, toggleEmployeeIncludeInReports } from '@/actions/admin/employees';
import { PageHeader } from '@/components/ui/page-header';
import { serverGet } from '@/lib/server-api';


export default async function AppEmployeesPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const authResult = await requireNavigationAccessById('employees');
  const user = authResult.user as User;

  const [usersResult, departments, positions] = await Promise.all([
    serverGet<{ users: User[]; total: number }>('/users?status=active,inactive&hiddenFromLists=false'),
    serverGet<Department[]>('/departments'),
    serverGet<Position[]>('/positions'),
  ]);
  const allEmployees: User[] = usersResult?.users ?? [];

  const sortedEmployees = [...allEmployees].sort((a, b) => (a.firstname ?? '').localeCompare(b.firstname ?? ''));

  const departmentParam = (await searchParams)?.department;
  const selectedDepartment =
    typeof departmentParam === 'string' && departmentParam.length > 0
      ? departmentParam
      : 'all';

  const roleParam = (await searchParams)?.role;
  const selectedRole =
    typeof roleParam === 'string' && roleParam.length > 0
      ? roleParam
      : 'all';

  const searchParam = (await searchParams)?.search;
  const searchTerm =
    typeof searchParam === 'string' && searchParam.trim().length > 0
      ? searchParam.trim().toLowerCase()
      : '';

  const filteredEmployees = sortedEmployees.filter((e: User) => {
    const matchDept = selectedDepartment === 'all' || e.department === selectedDepartment;
    const matchRole = selectedRole === 'all' || e.role === selectedRole;

    const fullName = `${e.firstname || ''} ${e.lastname || ''}`.toLowerCase();
    const email = (e.email || '').toLowerCase();
    const department = (e.department || '').toLowerCase();
    const position = (e.position || '').toLowerCase();
    const matchSearch =
      !searchTerm ||
      fullName.includes(searchTerm) ||
      email.includes(searchTerm) ||
      department.includes(searchTerm) ||
      position.includes(searchTerm);

    return matchDept && matchRole && matchSearch;
  });

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          badge="Employés"
          title="Gestion des employés"
          description="Administrez les comptes employés, leurs rôles et leurs affectations."
        />
        <EmployeesUpdateNotifier />
        <EmployeesSyncNotifier />

        <EmployeesStatsCards
          employees={sortedEmployees}
          departments={departments}
          positions={positions}
        />

        <EmployeesTable
          employees={filteredEmployees}
          currentUserRole={user.role}
          departments={departments.map((d: Department) => ({ id: d.id, name: d.name }))}
          positions={positions as unknown as { id: string; name: string; department: { name: string } | null }[]}
          onUpdateEmployee={updateEmployee as (formData: FormData) => void}
          onSyncFromLdap={syncEmployeesFromLdap}
          onSoftDeleteEmployee={adminSoftDeleteEmployee}
          onToggleIncludeInReports={toggleEmployeeIncludeInReports}
        />
      </div>
    </>
  );
}
