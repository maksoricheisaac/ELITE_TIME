export const dynamic = 'force-dynamic';

import { requireNavigationAccessById } from "@/lib/navigation-guard";
import { getEmployeeAbsences } from "@/actions/employee/absences";
import MyLeavesClient from "@/features/employee/leave-request";

export default async function MesCongesPage() {
  const auth = await requireNavigationAccessById("mes-conges");
  const absences = (await getEmployeeAbsences(auth.user.id)) ?? [];

  return <MyLeavesClient absences={absences} />;
}
