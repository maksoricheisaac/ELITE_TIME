import { serverGet } from "@/lib/server-api";
import type { User, Pointage, Break, Absence } from "@/types/models";
import { getEmployeeRecentPointages } from "@/actions/employee/pointages";
import EmployeePointagesClient from "@/features/employee/pointages";
import ManagerPointagesClient from "@/features/manager/pointages";
import { requireNavigationAccessById } from "@/lib/navigation-guard";
import { getUserPermissions } from "@/lib/security/rbac";

function resolveRange(searchParams?: { from?: string; to?: string }) {
  const fromParam = searchParams?.from;
  const toParam = searchParams?.to;

  const parseLocal = (value: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T00:00:00`);
    }
    return new Date(value);
  };

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setHours(0, 0, 0, 0);
  today.setHours(23, 59, 59, 999);

  const fromDate = fromParam ? parseLocal(fromParam) : defaultFrom;
  const toDate = toParam ? parseLocal(toParam) : today;

  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(23, 59, 59, 999);

  return { fromDate, toDate };
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function fetchTeamData(team: User[], fromStr: string, toStr: string) {
  const [pointages, absences, breaks] = await Promise.all([
    Promise.all(
      team.map((u) => serverGet<Pointage[]>(`/pointages?userId=${u.id}&from=${fromStr}&to=${toStr}`))
    ).then((r) => r.flat()),
    Promise.all(
      team.map((u) => serverGet<Absence[]>(`/absences?userId=${u.id}`))
    ).then((r) => r.flat()),
    Promise.all(
      team.map((u) => serverGet<Break[]>(`/breaks/today?userId=${u.id}`))
    ).then((r) => r.flat()),
  ]);
  return { pointages, absences, breaks };
}

export default async function AppPointagesPage(props: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const searchParams = await props.searchParams;
  const auth = await requireNavigationAccessById("pointages");

  const user = auth.user;
  const { fromDate, toDate } = resolveRange(searchParams);
  const fromStr = toDateStr(fromDate);
  const toStr = toDateStr(toDate);

  // Routing basé uniquement sur les permissions — aucune logique de rôle
  const permissions = await getUserPermissions(user.id);
  const permSet = new Set(permissions);

  const canViewAll  = permSet.has("pointages.view_all");
  const canViewTeam = permSet.has("pointages.view_team");

  if (!canViewAll && !canViewTeam) {
    // Pas d'accès équipe → vue personnelle (propres pointages uniquement)
    const pointages = await getEmployeeRecentPointages(user.id, fromDate, toDate);
    return (
      <EmployeePointagesClient
        pointages={pointages}
        canEdit={false}
        resolvedFrom={fromStr}
        resolvedTo={toStr}
      />
    );
  }

  // Vue équipe ou globale
  // pointages.view_all → tous les employés actifs
  // pointages.view_team → limité au département de l'utilisateur
  let employeesUrl = '/users?role=employee,team_lead&status=active&hiddenFromLists=false';
  if (canViewTeam && !canViewAll && user.department) {
    employeesUrl += `&department=${encodeURIComponent(user.department)}`;
  }

  const { users: rawEmployees } = await serverGet<{ users: User[]; total: number }>(employeesUrl);
  const sortedEmployees = [...rawEmployees].sort((a, b) => (a.firstname ?? "").localeCompare(b.firstname ?? ""));

  if (sortedEmployees.length === 0) {
    return <ManagerPointagesClient team={[]} pointages={[]} absences={[]} breaks={[]} />;
  }

  const { pointages, absences, breaks } = await fetchTeamData(sortedEmployees, fromStr, toStr);

  return (
    <ManagerPointagesClient
      team={sortedEmployees}
      pointages={pointages}
      absences={absences}
      breaks={breaks}
    />
  );
}
