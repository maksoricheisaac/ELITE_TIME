export const dynamic = 'force-dynamic';

import { serverGet } from "@/lib/server-api";
import type { User, SystemSettings } from "@/types/models";
import { requireNavigationAccessById } from "@/lib/navigation-guard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ManualPointageForm } from "@/features/manager/manual-pointage-form";
import { PageHeader } from "@/components/ui/page-header";
import { BackButton } from "@/components/ui/back-button";

export default async function ManualPointagesPage() {
  // pointages.create requis — géré par le registry entry 'pointages-manual'
  const auth = await requireNavigationAccessById("pointages-manual");

  const user = auth.user;

  const [{ users: rawEmployees }, settings] = await Promise.all([
    serverGet<{ users: User[]; total: number }>(
      '/users?role=employee&status=active&hiddenFromLists=false'
    ),
    serverGet<SystemSettings>('/settings'),
  ]);

  const sortedEmployees = [...rawEmployees].sort(
    (a, b) => (a.firstname ?? "").localeCompare(b.firstname ?? "")
  );

  const workStartTime = settings?.workStartTime ?? "08:45";
  const workEndTime = settings?.workEndTime ?? "17:30";

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Saisie manuelle"
        title="Rattrapage de pointages"
        description="Enregistrez les horaires d'un employé pour un jour donné en cas de panne ou maintenance."
      >
        <BackButton />
      </PageHeader>

      <Card className="border-border/50 py-0">
        <CardHeader className="border-b border-border/40 p-5">
          <CardTitle className="text-base">Enregistrer un pointage</CardTitle>
          <CardDescription>
            Sélectionnez l&apos;employé, la date et les heures d&apos;entrée / sortie d&apos;après le registre papier.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5">
          <ManualPointageForm
            managerId={user.id}
            workStartTime={workStartTime}
            workEndTime={workEndTime}
            employees={sortedEmployees}
          />
        </CardContent>
      </Card>
    </div>
  );
}
