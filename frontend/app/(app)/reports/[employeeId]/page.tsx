import { redirect } from "next/navigation";
import { serverGet } from "@/lib/server-api";
import type { User, Pointage, Break, Absence, SystemSettings } from "@/types/models";
import { requireNavigationAccessById } from "@/lib/navigation-guard";
import { getUserPermissions } from "@/lib/security/rbac";
import { formatMinutesHuman } from "@/lib/time-format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { EmployeePointagesDetailTable, type EmployeePointageDetailRow } from "@/features/manager/employee-pointages-detail-table";
import { EmployeeReportDateRangeFilter } from "@/features/manager/employee-report-date-range-filter";
import { EmployeeReportExports } from "@/features/manager/employee-report-exports";

interface EmployeeReportDetailPageProps {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<{ from?: string; to?: string; page?: string }>;
}

const PAGE_SIZE = 15;

function countBusinessDays(start: Date, end: Date) {
  const d = new Date(start);
  let count = 0;
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function getDayKeyLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function EmployeeReportDetailPage({ params, searchParams }: EmployeeReportDetailPageProps) {
  const { employeeId } = await params;
  const sp = (await searchParams) ?? {};

  // reports-detail requiert reports.view_team OU reports.view_all
  // Un utilisateur avec seulement reports.view_self ne peut pas voir les rapports individuels.
  const auth = await requireNavigationAccessById("reports-detail");

  // Vérifier les permissions d'export (PDF / Excel)
  const rawPerms = await getUserPermissions(auth.user.id);
  const permSet = new Set(rawPerms);
  const canExportPdf   = permSet.has('reports.export_pdf');
  const canExportExcel = permSet.has('reports.export_excel');

  const employee = await serverGet<User>(`/users/${employeeId}`);

  if (!employee || employee.role !== "employee") {
    redirect("/reports");
  }

  // Plage de dates
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const defaultFrom = new Date();
  defaultFrom.setDate(today.getDate() - 30);
  defaultFrom.setHours(0, 0, 0, 0);

  const parsedFrom = sp.from ? new Date(sp.from) : defaultFrom;
  const parsedTo = sp.to ? new Date(sp.to) : today;

  const from = Number.isNaN(parsedFrom.getTime()) ? defaultFrom : parsedFrom;
  const to = Number.isNaN(parsedTo.getTime()) ? today : parsedTo;

  const fromStr = getDayKeyLocal(from);
  const toStr = getDayKeyLocal(to);

  const [pointages, breaks, settings, employeeAbsences] = await Promise.all([
    serverGet<Pointage[]>(`/pointages?userId=${employee.id}&from=${fromStr}&to=${toStr}`),
    serverGet<Break[]>(`/breaks/today?userId=${employee.id}`),
    serverGet<SystemSettings>('/settings'),
    serverGet<Absence[]>(`/absences?userId=${employee.id}`),
  ]);

  const overtimeThreshold = settings?.overtimeThreshold ?? 40;
  const workStartTime = settings?.workStartTime ?? "08:45";
  const [startHour, startMinute] = workStartTime.split(":").map(Number);

  // Pauses par jour
  const breaksByDay = new Map<string, number>();
  for (const b of breaks) {
    const key = getDayKeyLocal(new Date(b.date as unknown as string));
    breaksByDay.set(key, (breaksByDay.get(key) ?? 0) + (b.duration ?? 0));
  }

  // Agrégation des sessions par jour
  type DayGroup = { dateKey: string; dateISO: string; sessions: typeof pointages };
  const dayGroupsMap = new Map<string, DayGroup>();

  for (const p of pointages) {
    const d = new Date(p.date as unknown as string);
    const key = getDayKeyLocal(d);
    if (!dayGroupsMap.has(key)) {
      dayGroupsMap.set(key, { dateKey: key, dateISO: d.toISOString(), sessions: [] });
    }
    dayGroupsMap.get(key)!.sessions.push(p);
  }

  // Trier par date desc
  const allDayGroups = Array.from(dayGroupsMap.values()).sort(
    (a, b) => b.dateKey.localeCompare(a.dateKey)
  );

  // Pagination sur les jours agrégés
  const totalDays = allDayGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalDays / PAGE_SIZE));
  const page = Math.max(1, Math.min(parseInt(sp.page ?? "1") || 1, totalPages));
  const pagedGroups = allDayGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function buildRow({ dateKey, dateISO, sessions }: DayGroup): EmployeePointageDetailRow {
    sessions.sort((a, b) => (a.sessionNumber ?? 1) - (b.sessionNumber ?? 1));
    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    const pauseMinutes = breaksByDay.get(dateKey) ?? 0;
    const totalDuration = sessions.reduce((sum, p) => sum + (p.duration ?? 0), 0);
    const sessionCount = sessions.length;

    let lateMinutes = 0;
    if (first.entryTime) {
      const [eh, em] = first.entryTime.split(":").map(Number);
      if (!Number.isNaN(eh) && !Number.isNaN(startHour)) {
        const diff = eh * 60 + em - (startHour * 60 + startMinute);
        if (diff > 0) lateMinutes = diff;
      }
    }

    const allIncomplete = sessions.every((p) => p.status === "incomplete" && !p.exitTime);
    const anyLate = sessions.some((p) => p.status === "late") || lateMinutes > 0;
    const aggStatus: string = allIncomplete ? "incomplete" : anyLate ? "late" : (first.status ?? "normal");

    return {
      id: first.id,
      date: dateISO,
      entryTime: first.entryTime,
      exitTime: allIncomplete ? null : (last.exitTime ?? null),
      duration: totalDuration,
      status: aggStatus,
      pauseMinutes,
      lateMinutes,
      lateReason: sessions.map((p) => p.lateReason).filter(Boolean).join(" | ") || null,
      earlyExitReason: sessions.map((p) => p.earlyExitReason).filter(Boolean).join(" | ") || null,
      sessionCount,
    };
  }

  // Construire les lignes agrégées
  const rows: EmployeePointageDetailRow[] = pagedGroups.map(buildRow);

  // Stats globales (sur toute la période, pas juste la page)
  const totalMinutes = pointages.reduce((sum: number, p: Pointage) => sum + p.duration, 0);
  const lateCount = allDayGroups.filter(({ sessions }) =>
    sessions.some((p) => p.status === "late") ||
    (() => {
      const first = sessions[0];
      if (!first?.entryTime) return false;
      const [eh, em] = first.entryTime.split(":").map(Number);
      return eh * 60 + em > startHour * 60 + startMinute;
    })()
  ).length;

  const businessDays = countBusinessDays(from, to);

  const workedDayKeys = new Set(allDayGroups.map((g) => g.dateKey));
  const approvedAbsences = (employeeAbsences ?? []).filter((a) => a.status === "approved");
  let absenceCount = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(to);
  rangeEnd.setHours(23, 59, 59, 999);
  while (cur <= rangeEnd) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const key = getDayKeyLocal(cur);
      if (!workedDayKeys.has(key)) {
        const covered = approvedAbsences.some((a) => {
          const s = new Date(a.startDate as unknown as string);
          const e = new Date(a.endDate as unknown as string);
          s.setHours(0, 0, 0, 0);
          e.setHours(23, 59, 59, 999);
          return cur >= s && cur <= e;
        });
        if (!covered) absenceCount++;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  const expectedMinutes = Math.round((businessDays / 5) * overtimeThreshold * 60);
  const overtimeMinutes = Math.max(0, totalMinutes - expectedMinutes);
  const rangeLabel = `${from.toLocaleDateString("fr-FR")} – ${to.toLocaleDateString("fr-FR")}`;

  // Toutes les lignes pour les exports (sans pagination)
  const allRows: EmployeePointageDetailRow[] = allDayGroups.map(buildRow);

  // URL helpers pour la pagination
  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <FileText className="h-3 w-3" />
            Rapport détaillé
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {employee.firstname} {employee.lastname}
          </h1>
          <p className="text-sm text-muted-foreground">
            Synthèse des heures travaillées, pauses et retards sur la période sélectionnée.
          </p>
        </div>
        <Button type="button" variant="outline" asChild className="cursor-pointer">
          <Link href="/reports" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Retour aux rapports</span>
          </Link>
        </Button>
      </div>

      <Card className="border border-border/80 bg-card/90 shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Résumé de la période</CardTitle>
              <CardDescription>Période analysée : {rangeLabel}</CardDescription>
            </div>
            <div className="flex flex-col items-stretch gap-2 md:items-end">
              <EmployeeReportDateRangeFilter />
              <EmployeeReportExports
                employeeId={employeeId}
                employee={{
                  firstname: employee.firstname as string,
                  lastname: employee.lastname as string,
                  department: employee.department,
                }}
                from={from.toISOString()}
                to={to.toISOString()}
                rows={allRows}
                canExportPdf={canExportPdf}
                canExportExcel={canExportExcel}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1 rounded-lg border bg-background/60 p-3">
              <p className="text-xs font-medium text-muted-foreground">Heures travaillées</p>
              <p className="text-2xl font-bold">{formatMinutesHuman(totalMinutes)}</p>
            </div>
            <div className="space-y-1 rounded-lg border bg-background/60 p-3">
              <p className="text-xs font-medium text-muted-foreground">Retards</p>
              <p className="text-2xl font-bold text-destructive">{lateCount}</p>
            </div>
            <div className="space-y-1 rounded-lg border bg-background/60 p-3">
              <p className="text-xs font-medium text-muted-foreground">Absences</p>
              <p className="text-2xl font-bold text-warning">{absenceCount}</p>
            </div>
            <div className="space-y-1 rounded-lg border bg-background/60 p-3">
              <p className="text-xs font-medium text-muted-foreground">Heures sup</p>
              <p className="text-2xl font-bold text-success">{formatMinutesHuman(overtimeMinutes)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>Détail des pointages</CardTitle>
          <CardDescription>
            Vue journalière des heures d&apos;entrée, de sortie et des durées sur la période sélectionnée.
            {totalDays > PAGE_SIZE && (
              <span className="ml-1 text-muted-foreground">
                — Page {page}/{totalPages} ({totalDays} jours au total)
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun pointage trouvé pour cette période.
            </p>
          ) : (
            <>
              <EmployeePointagesDetailTable rows={rows} />

              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Page {page} / {totalPages} — {totalDays} jour(s) au total
                  </span>
                  <div className="flex items-center gap-2">
                    {page > 1 ? (
                      <Button variant="outline" size="sm" asChild className="cursor-pointer">
                        <Link href={buildPageUrl(page - 1)}>
                          <ChevronLeft className="h-4 w-4" />
                          <span>Précédent</span>
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        <ChevronLeft className="h-4 w-4" />
                        <span>Précédent</span>
                      </Button>
                    )}
                    {page < totalPages ? (
                      <Button variant="outline" size="sm" asChild className="cursor-pointer">
                        <Link href={buildPageUrl(page + 1)}>
                          <span>Suivant</span>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        <span>Suivant</span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
