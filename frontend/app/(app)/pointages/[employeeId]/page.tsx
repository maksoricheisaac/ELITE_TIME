import { redirect } from "next/navigation";
import { serverGet } from "@/lib/server-api";
import type { User, Pointage, Break, SystemSettings } from "@/types/models";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { requireNavigationAccessById } from "@/lib/navigation-guard";
import { EmployeePointagesDetailTable, type EmployeePointageDetailRow } from "@/features/manager/employee-pointages-detail-table";
import { ArrowLeft } from "lucide-react";
import { EmployeePointagesPeriodFilter } from "@/features/manager/employee-pointages-period-filter";

interface PointageDetailPageProps {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<{ period?: string }>;
}

export default async function PointageDetailPage({ params, searchParams }: PointageDetailPageProps) {
  const { employeeId } = await params;

  // 'pointages' requiert pointages.view_team OU pointages.view_all — suffisant pour voir un individu.
  await requireNavigationAccessById('pointages');

  const { users: employeeResults } = await serverGet<{ users: User[]; total: number }>(
    `/users?id=${employeeId}`
  );
  const employee = employeeResults?.[0] ?? null;

  if (!employee || employee.role !== "employee") {
    redirect("/pointages");
  }

  const period = (await searchParams)?.period ?? "30"; // en jours ou "all"

  let since: Date | null = null;
  if (period !== "all") {
    const days = parseInt(period, 10);
    if (!Number.isNaN(days) && days > 0) {
      since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);
    }
  }

  const fromStr = since
    ? `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`
    : undefined;

  const [pointagesRaw, breaksRaw, settings] = await Promise.all([
    serverGet<Pointage[]>(
      `/pointages?userId=${employee.id}${fromStr ? `&from=${fromStr}` : ''}`
    ),
    serverGet<Break[]>(
      `/breaks/today?userId=${employee.id}`
    ),
    serverGet<SystemSettings>('/settings'),
  ]);

  const workStartTime = settings?.workStartTime ?? "08:45";
  const [startHour, startMinute] = workStartTime.split(":").map(Number);

  const breaksByDay = new Map<string, number>();
  for (const b of breaksRaw) {
    const d = new Date(b.date as unknown as string);
    const key = d.toISOString().split("T")[0];
    const current = breaksByDay.get(key) ?? 0;
    breaksByDay.set(key, current + (b.duration ?? 0));
  }

  const rows: EmployeePointageDetailRow[] = pointagesRaw.map((p: Pointage) => {
    const d = new Date(p.date as unknown as string);
    const key = d.toISOString().split("T")[0];
    const pauseMinutes = breaksByDay.get(key) ?? 0;

    let lateMinutes = 0;
    if (p.entryTime) {
      const [eh, em] = p.entryTime.split(":").map(Number);
      if (!Number.isNaN(eh) && !Number.isNaN(em) && !Number.isNaN(startHour) && !Number.isNaN(startMinute)) {
        const diff = (eh * 60 + em) - (startHour * 60 + startMinute);
        if (diff > 0) {
          lateMinutes = diff;
        }
      }
    }

    return {
      id: p.id,
      date: d.toISOString(),
      entryTime: p.entryTime,
      exitTime: p.exitTime,
      duration: p.duration,
      status: p.status,
      pauseMinutes,
      lateMinutes,
      lateReason: p.lateReason,
      earlyExitReason: p.earlyExitReason,
      sessionNumber: p.sessionNumber,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Détails des pointages
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {employee.firstname} {employee.lastname}
          </h1>
          <p className="text-sm text-muted-foreground">
            Historique des pointages et pauses pour cet employé.
          </p>
        </div>
        <Button type="button" variant="outline" asChild className="cursor-pointer">
          <Link href="/pointages" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Retour</span>
          </Link>
        </Button>
      </div>

      <Card className="border border-border/80 bg-card/90 shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Historique des pointages</CardTitle>
            <CardDescription>
              Vue détaillée des heures d&apos;entrée, de sortie, des durées et des pauses associées.
            </CardDescription>
          </div>
          <div className="inline-flex flex-col md:flex-row md:items-end md:justify-between md:gap-3">
            <EmployeePointagesPeriodFilter period={period} />
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun pointage trouvé pour cet employé.
            </p>
          ) : (
            <EmployeePointagesDetailTable rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
