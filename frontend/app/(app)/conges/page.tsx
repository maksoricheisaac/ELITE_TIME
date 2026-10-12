export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { serverGet } from "@/lib/server-api";
import LeaveManagementClient from "@/features/manager/leaves";
import { requireNavigationAccessById } from "@/lib/navigation-guard";
import { getUserPermissions } from "@/lib/security/rbac";
import type { User, Absence } from "@/types/models";

async function fetchTeamAbsences(
  team: User[],
): Promise<(Absence & { user: Pick<User, "id" | "firstname" | "lastname" | "department" | "position"> })[]> {
  const teamById = new Map(team.map((u) => [u.id, u]));
  const allAbsences = (await serverGet<Absence[]>(`/absences/team`)) ?? [];
  return allAbsences
    .filter((a) => a.type === "conge" && teamById.has(a.userId))
    .sort(
      (a, b) =>
        new Date(b.startDate as unknown as string).getTime() -
        new Date(a.startDate as unknown as string).getTime(),
    )
    .map((a) => ({
      ...a,
      user: teamById.get(a.userId) as Pick<
        User,
        "id" | "firstname" | "lastname" | "department" | "position"
      >,
    }));
}

export default async function AppLeavesPage() {
  let team: User[] = [];
  let absences: (Absence & {
    user: Pick<User, "id" | "firstname" | "lastname" | "department" | "position">;
  })[] = [];
  let currentUserRole: User["role"] = "employee";

  try {
    const auth = await requireNavigationAccessById("conges");
    const currentUser = auth.user;
    currentUserRole = currentUser.role;

    // Routing basé uniquement sur les permissions — aucune logique de rôle
    const permissions = await getUserPermissions(currentUser.id);
    const permSet = new Set(permissions);

    if (permSet.has('absences.view_all')) {
      // Accès global : tous les employés sans restriction de département
      const { users: allUsers } = await serverGet<{ users: User[]; total: number }>(
        `/users?role=employee&status=active,inactive`,
      );
      team = [...allUsers].sort((a, b) =>
        (a.firstname ?? "").localeCompare(b.firstname ?? ""),
      );
    } else {
      // Accès équipe : filtré par département (absences.view_team ou absences.approve)
      if (!currentUser.department) {
        return <LeaveManagementClient team={[]} absences={[]} currentUserRole={currentUserRole} />;
      }

      const { users: teamUsers } = await serverGet<{ users: User[]; total: number }>(
        `/users?role=employee&status=active,inactive&department=${encodeURIComponent(currentUser.department)}`,
      );
      team = [...teamUsers].sort((a, b) =>
        (a.firstname ?? "").localeCompare(b.firstname ?? ""),
      );
    }

    if (team.length === 0) {
      return <LeaveManagementClient team={[]} absences={[]} currentUserRole={currentUserRole} />;
    }

    absences = await fetchTeamAbsences(team);
  } catch (e) {
    // Laisser propager les erreurs de redirection Next.js (redirect() lance une exception)
    const err = e as { digest?: string };
    if (typeof err?.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')) throw e;
    redirect('/403');
  }

  return <LeaveManagementClient team={team} absences={absences} currentUserRole={currentUserRole} />;
}
