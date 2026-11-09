import React from 'react';
import { redirect } from 'next/navigation';
import { serverGet } from '@/lib/server-api';
import type { User, Pointage, Break, Absence, SystemSettings } from '@/types/models';
import { managerGetReportsData } from '@/actions/manager/reports';
import ManagerReportsClient from '@/features/manager/reports';
import { requireNavigationAccessById } from '@/lib/navigation-guard';
import { getUserPermissions } from '@/lib/security/rbac';

export const dynamic = 'force-dynamic';

type ReportsSearchParams = { from?: string; to?: string };

function resolveRange(searchParams?: ReportsSearchParams) {
  const fromParam = searchParams?.from;
  const toParam = searchParams?.to;

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(today.getDate() - 30);
  defaultFrom.setHours(0, 0, 0, 0);

  const defaultTo = new Date(today);
  defaultTo.setHours(23, 59, 59, 999);

  const fromDate = fromParam ? new Date(fromParam as string) : defaultFrom;
  const toDate = toParam ? new Date(toParam as string) : defaultTo;

  if (fromDate > toDate) {
    toDate.setDate(fromDate.getDate() + 1);
    toDate.setHours(23, 59, 59, 999);
  } else {
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);
  }

  return { fromDate, toDate };
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function fetchTeamReportData(team: User[], fromStr: string, toStr: string) {
  const [pointages, breaks, absences] = await Promise.all([
    Promise.all(
      team.map((u) => serverGet<Pointage[]>(`/pointages?userId=${u.id}&from=${fromStr}&to=${toStr}`))
    ).then((r) => r.flat()),
    Promise.all(
      team.map((u) => serverGet<Break[]>(`/breaks/today?userId=${u.id}`))
    ).then((r) => r.flat()),
    serverGet<Absence[]>("/absences/team"),
  ]);
  return { pointages, breaks, absences: absences ?? [] };
}

export default async function AppReportsPage(props: {
  searchParams: Promise<ReportsSearchParams>;
}) {
  const searchParams = await props.searchParams;
  let result: React.ReactElement | null = null;

  try {
    const auth = await requireNavigationAccessById('reports');
    const user = auth.user;

    // Routing + permissions d'export basés uniquement sur les permissions
    const permissions = await getUserPermissions(user.id);
    const permSet = new Set(permissions);
    const canExportPdf   = permSet.has('reports.export_pdf');
    const canExportExcel = permSet.has('reports.export_excel');

    if (permSet.has('reports.view_all')) {
      // Accès global : tous les employés (admins + managers avec view_all)
      const { users: rawEmployees } = await serverGet<{ users: User[]; total: number }>(
        '/users?role=employee&status=active&hiddenFromLists=false'
      );
      const sortedEmployees = [...rawEmployees].sort((a, b) => (a.firstname ?? '').localeCompare(b.firstname ?? ''));
      const settings = await serverGet<SystemSettings>('/settings');
      const overtimeThreshold = settings?.overtimeThreshold ?? 40;

      if (sortedEmployees.length === 0) {
        result = <ManagerReportsClient team={[]} pointages={[]} breaks={[]} absences={[]} overtimeThreshold={overtimeThreshold} canExportPdf={canExportPdf} canExportExcel={canExportExcel} />;
      } else {
        const { fromDate, toDate } = resolveRange(searchParams);
        const { pointages, breaks, absences } = await fetchTeamReportData(sortedEmployees, toDateStr(fromDate), toDateStr(toDate));
        result = <ManagerReportsClient team={sortedEmployees} pointages={pointages} breaks={breaks} absences={absences} overtimeThreshold={overtimeThreshold} canExportPdf={canExportPdf} canExportExcel={canExportExcel} />;
      }
    } else if (permSet.has('reports.view_team')) {
      // Accès équipe : via server actions dédiées (filtre département)
      const data = await managerGetReportsData(user.id);
      result = (
        <ManagerReportsClient
          team={data.team}
          pointages={data.pointages}
          breaks={data.breaks}
          absences={data.absences}
          overtimeThreshold={data.overtimeThreshold}
          canExportPdf={canExportPdf}
          canExportExcel={canExportExcel}
        />
      );
    } else if (permSet.has('reports.view_self')) {
      // Accès personnel seulement — vue équipe limitée au département
      let employeesUrl = '/users?role=employee&status=active&hiddenFromLists=false';
      if (user.department) employeesUrl += `&department=${encodeURIComponent(user.department)}`;

      const { users: rawEmployees } = await serverGet<{ users: User[]; total: number }>(employeesUrl);
      const sortedEmployees = [...rawEmployees].sort((a, b) => (a.firstname ?? '').localeCompare(b.firstname ?? ''));
      const settings = await serverGet<SystemSettings>('/settings');
      const overtimeThreshold = settings?.overtimeThreshold ?? 40;

      if (sortedEmployees.length === 0) {
        result = <ManagerReportsClient team={[]} pointages={[]} breaks={[]} absences={[]} overtimeThreshold={overtimeThreshold} canExportPdf={canExportPdf} canExportExcel={canExportExcel} />;
      } else {
        const { fromDate, toDate } = resolveRange(searchParams);
        const { pointages, breaks, absences } = await fetchTeamReportData(sortedEmployees, toDateStr(fromDate), toDateStr(toDate));
        result = <ManagerReportsClient team={sortedEmployees} pointages={pointages} breaks={breaks} absences={absences} overtimeThreshold={overtimeThreshold} canExportPdf={canExportPdf} canExportExcel={canExportExcel} />;
      }
    } else {
      redirect('/403');
    }
  } catch (error) {
    const err = error as { digest?: string };
    if (typeof err?.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')) throw error;
    console.error("Erreur lors de l'accès aux rapports:", error);
    redirect('/403');
  }

  return result;
}
