export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { serverGet } from "@/lib/server-api";
import type { User, Absence, Pointage, Break, SystemSettings } from "@/types/models";
import { getAdminDashboardStats } from "@/actions/admin/dashboard";
import { getSystemSettings } from "@/actions/admin/settings";
import {
  getEmployeeTodayPointage,
  getEmployeeWeekStats,
  getEmployeeIncompletePointages,
} from "@/actions/employee/pointages";
import { getEmployeeTodayBreaks } from "@/actions/employee/breaks";
import EmployeeDashboardClient from "@/features/employee/dashboard";
import ManagerDashboardClient from "@/features/manager/dashboard";
import AdminDashboardClient from "@/features/admin/dashboard";
import { requireNavigationAccessById } from "@/lib/navigation-guard";
import { getUserPermissions } from "@/lib/security/rbac";

export default async function AppDashboardPage() {
  const auth = await requireNavigationAccessById('dashboard');
  if (!auth) redirect('/login');

  const meResult = await serverGet<{ user: User } | null>('/auth/me');
  const user = meResult?.user;
  if (!user) redirect('/login');

  // Routing basé uniquement sur les permissions — aucune logique de rôle
  const permissions = await getUserPermissions(user.id);
  const permSet = new Set(permissions);

  // dashboard.view_global → vue admin (stats globales)
  if (permSet.has('dashboard.view_global')) {
    const stats = await getAdminDashboardStats();
    return <AdminDashboardClient stats={stats} />;
  }

  // dashboard.view_team → vue manager (stats équipe)
  if (permSet.has('dashboard.view_team')) {
    const stats = await serverGet<{
      totalUsers: number;
      employees: number;
      managers: number;
      admins: number;
      activeToday: number;
      departments: { name: string; count: number }[];
    }>("/dashboard/manager/stats");
    return <ManagerDashboardClient stats={stats} />;
  }

  // Sinon → vue employé (dashboard personnel)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);

  const [todayPointage, weekStats, systemSettings, todayBreaks, todayLeaveAbsences, incompletePointages] =
    await Promise.all([
      getEmployeeTodayPointage(user.id) as Promise<Pointage | null>,
      getEmployeeWeekStats(user.id) as Promise<{ hours: number; lates: number; overtime: number }>,
      getSystemSettings() as Promise<SystemSettings>,
      getEmployeeTodayBreaks(user.id) as Promise<Break[]>,
      serverGet<Absence[]>(`/absences?userId=${user.id}`),
      getEmployeeIncompletePointages(user.id) as Promise<Pointage[]>,
    ]);

  const todayLeave =
    (todayLeaveAbsences as Absence[]).find((a) => {
      if (a.type !== "conge" || a.status !== "approved") return false;
      const start = new Date(a.startDate as string);
      const end = new Date(a.endDate as string);
      return start <= todayEnd && end >= todayStart;
    }) ?? null;

  return (
    <EmployeeDashboardClient
      user={user}
      todayPointage={todayPointage}
      weekStats={weekStats}
      workStartTime={(systemSettings as SystemSettings)?.workStartTime ?? "08:45"}
      workEndTime={(systemSettings as SystemSettings)?.workEndTime ?? "17:30"}
      initialBreaks={todayBreaks as Break[]}
      isOnLeaveToday={Boolean(todayLeave)}
      incompletePointages={incompletePointages as Pointage[]}
    />
  );
}
