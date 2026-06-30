
export const dynamic = 'force-dynamic';

import { requireNavigationAccessById } from '@/lib/navigation-guard';
import { AccessControl } from '@/lib/security/access-control';
import { serverGet } from '@/lib/server-api';
import type { Department } from '@/types/models';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PositionsFilter } from '@/components/customs/positions-filter';
import { PositionsTable } from '@/features/admin/positions-table';
import { PositionsCreateDialog } from '@/features/admin/positions-create-dialog';
import type { PositionWithDepartment } from '@/features/admin/positions-table';
import {
  createPositionFromForm,
  updatePositionFromForm,
  deletePositionFromForm,
} from '@/actions/admin/positions';
import { Briefcase, Building2, Layers } from 'lucide-react';

export default async function AppPositionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireNavigationAccessById('postes');

  const [canCreate, canEdit, canDelete] = await Promise.all([
    AccessControl.can('positions.create'),
    AccessControl.can('positions.edit'),
    AccessControl.can('positions.delete'),
  ]);

  const [departments, positions] = await Promise.all([
    serverGet<Department[]>('/departments'),
    serverGet<PositionWithDepartment[]>('/positions'),
  ]);

  const departmentParam = (await searchParams)?.department;
  const selectedDepartment =
    typeof departmentParam === 'string' && departmentParam.length > 0
      ? departmentParam
      : 'all';

  const filteredPositions: PositionWithDepartment[] =
    selectedDepartment === 'all'
      ? (positions as PositionWithDepartment[])
      : (positions as PositionWithDepartment[]).filter((p) => p.departmentId === selectedDepartment);

  const totalPositions = (positions as PositionWithDepartment[]).length;
  const positionsByDepartment = new Map<string, number>();
  (positions as PositionWithDepartment[]).forEach((p) => {
    const deptName = p.department?.name ?? 'Non assigné';
    positionsByDepartment.set(deptName, (positionsByDepartment.get(deptName) ?? 0) + 1);
  });

  const departmentsWithoutPositions = (departments as Department[]).filter(
    (d) => !positionsByDepartment.has(d.name) || (positionsByDepartment.get(d.name) ?? 0) === 0,
  ).length;

  const topDepartments = Array.from(positionsByDepartment.entries())
    .filter(([name]) => name !== 'Non assigné')
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2);

  return (
    <div className="space-y-4">
      <PageHeader
        badge="Postes"
        title="Gestion des postes"
        description="Gérez les postes disponibles par département."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-border/50 py-0">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Total postes</p>
                <p className="text-2xl font-bold tabular-nums">{totalPositions}</p>
                <p className="text-xs text-muted-foreground">{(departments as Department[]).length} départements</p>
              </div>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-2 shrink-0">
                <Briefcase className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 py-0">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top dépts</p>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-2 shrink-0">
                <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            {topDepartments.length > 0 ? (
              <div className="space-y-1">
                {topDepartments.map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <span className="truncate text-muted-foreground">{name}</span>
                    <span className="font-semibold tabular-nums ml-2">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Aucun poste défini</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 py-0">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Sans poste</p>
                <p className="text-2xl font-bold tabular-nums">{departmentsWithoutPositions}</p>
                <p className="text-xs text-muted-foreground">dépôts vides</p>
              </div>
              <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 p-2 shrink-0">
                <Layers className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 py-0">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Non assignés</p>
                <p className="text-2xl font-bold tabular-nums">{positionsByDepartment.get('Non assigné') ?? 0}</p>
                <p className="text-xs text-muted-foreground">sans département</p>
              </div>
              <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2 shrink-0">
                <Briefcase className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 py-0">
        <CardHeader className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/40">
          <div>
            <CardTitle className="text-base">
              Liste des postes
              <span className="ml-2 text-sm font-normal text-muted-foreground">({filteredPositions.length})</span>
            </CardTitle>
            <CardDescription className="mt-0.5">
              Gérez les postes disponibles dans chaque département.
            </CardDescription>
          </div>
          {canCreate && (
            <PositionsCreateDialog
              departments={(departments as Department[]).map((d) => ({ id: d.id, name: d.name }))}
              action={createPositionFromForm}
            />
          )}
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {(departments as Department[]).length > 1 && (
            <PositionsFilter
              departments={(departments as Department[]).map((d) => ({ id: d.id, name: d.name }))}
              selectedDepartment={selectedDepartment}
            />
          )}
          <PositionsTable
            data={filteredPositions}
            departments={(departments as Department[]).map((d) => ({ id: d.id, name: d.name }))}
            onUpdatePosition={updatePositionFromForm}
            onDeletePosition={deletePositionFromForm}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </CardContent>
      </Card>
    </div>
  );
}
