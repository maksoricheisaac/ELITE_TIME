"use client";

import { useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Pointage, Absence } from "@/types/models";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, type StatusKey } from "@/components/ui/status-badge";
import { DailyHoursChart, type DailyHoursPoint } from "@/components/charts/daily-hours-chart";
import { EmployeeReportDateRangeFilter } from "@/features/manager/employee-report-date-range-filter";
import { formatMinutesHuman } from "@/lib/time-format";
import { eachDay, isWorkingDay, normalizeHolidays, parseHM, type DayKey } from "@elitetime/time";
import { BUSINESS_TZ, businessDayKey, leaveDayKeys, summarizePeriod } from "@/lib/period-stats";
import { dayKeyOf } from "@elitetime/time";

interface MonRapportClientProps {
  pointages: Pointage[];
  absences: Absence[];
  workStartTime: string;
  businessDays?: number;
  /** Jours fériés (réglage SystemSettings.holidays) */
  holidays?: unknown;
  resolvedFrom: string;
  resolvedTo: string;
  userFirstname: string;
}

/** Jour calendaire du fuseau métier (Africa/Brazzaville), identique à l'API et aux rapports. */
function getDayKeyLocal(d: Date): string {
  return businessDayKey(d) ?? "";
}

type CalendarKind = "normal" | "late" | "incomplete" | "leave" | "absent" | "weekend" | "future";

const CAL_STYLE: Record<CalendarKind, { cls: string; label: string }> = {
  normal: { cls: "bg-success-soft text-success border-success/30", label: "À l'heure" },
  late: { cls: "bg-warning-soft text-warning border-warning/30", label: "Retard" },
  incomplete: { cls: "bg-danger-soft text-danger border-danger/30", label: "Incomplet" },
  leave: { cls: "bg-info-soft text-info border-info/30", label: "Congé" },
  absent: { cls: "bg-neutral-soft text-muted-foreground border-border", label: "Sans pointage" },
  weekend: { cls: "bg-transparent text-muted-foreground/50 border-transparent", label: "Week-end" },
  future: { cls: "bg-transparent text-muted-foreground/50 border-border border-dashed", label: "À venir" },
};

const MAX_CALENDAR_DAYS = 366;

export default function MonRapportClient({
  pointages,
  absences,
  workStartTime,
  businessDays: _businessDaysFromServer,
  holidays,
  resolvedFrom,
  resolvedTo,
  userFirstname,
}: MonRapportClientProps) {
  // Les règles de calcul (retard, incomplet, présence, absences) sont inchangées.
  const stats = useMemo(() => {
    type DayGroup = { dateKey: string; sessions: Pointage[] };
    const dayGroupsMap = new Map<string, DayGroup>();
    for (const p of pointages) {
      const key = getDayKeyLocal(new Date(p.date));
      if (!dayGroupsMap.has(key)) dayGroupsMap.set(key, { dateKey: key, sessions: [] });
      dayGroupsMap.get(key)!.sessions.push(p);
    }
    const dayGroups = Array.from(dayGroupsMap.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    const totalMinutes = pointages.reduce((sum, p) => sum + (p.duration ?? 0), 0);
    const workedDays = dayGroups.length;
    const avgMinutesPerDay = workedDays > 0 ? totalMinutes / workedDays : 0;

    let lateCount = 0;
    let totalLateMinutes = 0;
    let incompleteCount = 0;
    let completeDays = 0;
    const dayKinds = new Map<string, "normal" | "late" | "incomplete">();

    for (const { dateKey, sessions } of dayGroups) {
      const first = sessions[0];
      let lateMinutes = 0;
      const entryMin = parseHM(first?.entryTime);
      const startMin = parseHM(workStartTime);
      // Un retard n'existe que sur un jour ouvré (ni week-end ni férié), même règle que l'API.
      if (entryMin !== null && startMin !== null && isWorkingDay(dateKey as DayKey, normalizeHolidays(holidays))) {
        if (entryMin > startMin) lateMinutes = entryMin - startMin;
      }
      const isLate = lateMinutes > 0 || (sessions.some((p) => p.status === "late") && isWorkingDay(dateKey as DayKey, normalizeHolidays(holidays)));
      const isIncomplete = sessions.some((p) => p.status === "incomplete");

      if (isLate) {
        lateCount += 1;
        totalLateMinutes += lateMinutes;
      }
      if (isIncomplete) {
        incompleteCount += 1;
      } else if (!isLate) {
        completeDays += 1;
      }
      dayKinds.set(dateKey, isIncomplete ? "incomplete" : isLate ? "late" : "normal");
    }

    const punctualityRate = workedDays > 0 ? ((workedDays - lateCount) / workedDays) * 100 : 100;

    const workedDayKeys = new Set(dayGroups.map((g) => g.dateKey));
    const holidaySet = normalizeHolidays(holidays);
    const approvedAbsences = absences.filter((a) => a.status === "approved");
    const leaveKeys = leaveDayKeys(approvedAbsences, resolvedFrom, resolvedTo, holidays);
    const todayKey = dayKeyOf(new Date(), BUSINESS_TZ);
    // Classement unique et exclusif (travaillé / congé / absent / futur) — moteur @elitetime/time
    const summary = summarizePeriod({
      from: resolvedFrom,
      to: resolvedTo,
      workedDayKeys,
      absences: approvedAbsences,
      holidays,
      today: todayKey,
    });

    const calendar: { key: string; date: Date; kind: CalendarKind }[] = [];
    for (const key of eachDay(resolvedFrom, resolvedTo)) {
      let kind: CalendarKind;
      if (workedDayKeys.has(key)) kind = dayKinds.get(key) ?? "normal";
      else if (!isWorkingDay(key, holidaySet)) kind = "weekend";
      else if (leaveKeys.has(key)) kind = "leave";
      else kind = key > todayKey ? "future" : "absent";
      const [y, m, d] = key.split("-").map(Number);
      calendar.push({ key, date: new Date(y, m - 1, d), kind });
    }

    const absenceCount = summary.leaveDays;
    // Présence = jours ouvrés pointés / jours ouvrés écoulés (un week-end travaillé ne fait jamais dépasser 100 %)
    const presenceRate =
      summary.elapsedWorkingDays > 0
        ? Math.min(100, (summary.workedDays / summary.elapsedWorkingDays) * 100)
        : 0;

    return {
      totalMinutes,
      workedDays,
      avgMinutesPerDay,
      lateCount,
      totalLateMinutes,
      punctualityRate,
      absenceCount,
      incompleteCount,
      completeDays,
      presenceRate,
      workingDays: summary.workingDays,
      dayGroups,
      dayKinds,
      calendar,
    };
  }, [pointages, absences, workStartTime, holidays, resolvedFrom, resolvedTo]);

  const hoursData: DailyHoursPoint[] = useMemo(
    () =>
      stats.dayGroups.map(({ dateKey, sessions }) => ({
        label: new Date(`${dateKey}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        hours: Math.round((sessions.reduce((s, p) => s + (p.duration ?? 0), 0) / 60) * 10) / 10,
        kind: stats.dayKinds.get(dateKey) ?? "normal",
      })),
    [stats.dayGroups, stats.dayKinds],
  );

  // Détail jour par jour (plus récent d'abord)
  const dailyRows = useMemo(
    () =>
      [...stats.dayGroups].reverse().map(({ dateKey, sessions }) => {
        const sorted = [...sessions].sort((a, b) => (a.sessionNumber ?? 1) - (b.sessionNumber ?? 1));
        const entry = sorted[0]?.entryTime ?? null;
        const exit = [...sorted].reverse().find((p) => p.exitTime)?.exitTime ?? null;
        return {
          dateKey,
          entry,
          exit,
          minutes: sessions.reduce((s, p) => s + (p.duration ?? 0), 0),
          sessions: sessions.length,
          status: (stats.dayKinds.get(dateKey) ?? "normal") as StatusKey,
        };
      }),
    [stats.dayGroups, stats.dayKinds],
  );

  const defaultRange = useMemo(() => ({ from: resolvedFrom, to: resolvedTo }), [resolvedFrom, resolvedTo]);

  const rangeLabel = useMemo(() => {
    const from = new Date(`${resolvedFrom}T00:00:00`);
    const to = new Date(`${resolvedTo}T00:00:00`);
    return `${from.toLocaleDateString("fr-FR")} – ${to.toLocaleDateString("fr-FR")}`;
  }, [resolvedFrom, resolvedTo]);

  // Calendrier en semaines (lundi → dimanche)
  const calendar = stats.calendar;
  const weeks = useMemo(() => {
    if (calendar.length === 0 || calendar.length > MAX_CALENDAR_DAYS) return [];
    const cells: ((typeof calendar)[number] | null)[] = [];
    const lead = (calendar[0].date.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) cells.push(null);
    cells.push(...calendar);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [calendar]);

  // La hauteur du calendrier est plafonnée : une longue période défile dans la carte
  // (positionnée sur la semaine la plus récente) au lieu de repousser le contenu.
  const calScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = calScroll.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [weeks]);

  const fmtDay = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mon rapport"
        description={`${userFirstname ? `Activité de ${userFirstname}` : "Votre activité"} · ${rangeLabel}`}
        actions={<EmployeeReportDateRangeFilter defaultRange={defaultRange} />}
      />

      <section aria-labelledby="rapport-kpi" className="space-y-3">
        <h2 id="rapport-kpi" className="sr-only">Résumé de la période</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Présence"
            value={`${Math.round(stats.presenceRate)} %`}
            hint={`${stats.workedDays} jour${stats.workedDays > 1 ? "s" : ""} pointé${stats.workedDays > 1 ? "s" : ""} sur ${stats.workingDays} ouvré${stats.workingDays > 1 ? "s" : ""}`}
          />
          <StatCard label="Temps travaillé" value={formatMinutesHuman(stats.totalMinutes)} hint="Total sur la période" />
          <StatCard label="Moyenne / jour" value={formatMinutesHuman(stats.avgMinutesPerDay)} hint="Sur les jours pointés" />
          <StatCard
            label="Retards"
            value={stats.lateCount}
            tone={stats.lateCount ? "warning" : "success"}
            toneLabel={stats.lateCount ? "Retard" : "Aucun"}
            hint={stats.lateCount ? `${formatMinutesHuman(stats.totalLateMinutes)} cumulées` : "Aucun retard"}
          />
          <StatCard
            label="Ponctualité"
            value={`${Math.round(stats.punctualityRate)} %`}
            hint="Jours pointés à l'heure"
          />
          <StatCard
            label="Congés / absences"
            value={stats.absenceCount}
            hint={
              stats.incompleteCount
                ? `${stats.incompleteCount} pointage${stats.incompleteCount > 1 ? "s" : ""} incomplet${stats.incompleteCount > 1 ? "s" : ""}`
                : "Jours de congé approuvé"
            }
            tone={stats.incompleteCount ? "danger" : "neutral"}
            toneLabel={stats.incompleteCount ? "À régulariser" : undefined}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DailyHoursChart
            data={hoursData}
            title="Heures travaillées par jour"
            description={`Durée enregistrée chaque jour pointé · ${rangeLabel}`}
          />
        </div>

        <Card className="max-h-[22.5rem] gap-3 py-4 shadow-none">
          <CardHeader className="px-4">
            <CardTitle className="text-base font-semibold">Calendrier de la période</CardTitle>
            <CardDescription className="text-xs">Statut de chaque jour ouvré</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-4">
            {weeks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {stats.calendar.length === 0
                  ? "Aucune période sélectionnée."
                  : `Période trop longue pour le calendrier (plus de ${MAX_CALENDAR_DAYS} jours) : utilisez le tableau ci-dessous.`}
              </p>
            ) : (
              <>
                <div role="grid" aria-label="Calendrier de la période" className="flex min-h-0 flex-1 flex-col gap-1">
                  <div role="row" className="grid shrink-0 grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
                    {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                      <span key={i} role="columnheader">{d}</span>
                    ))}
                  </div>
                  <div ref={calScroll} className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                  {weeks.map((week, wi) => (
                    <div key={wi} role="row" className="grid grid-cols-7 gap-1">
                      {week.map((c, ci) =>
                        c ? (
                          <span
                            key={c.key}
                            role="gridcell"
                            title={`${fmtDay(c.key)} : ${CAL_STYLE[c.kind].label}`}
                            aria-label={`${fmtDay(c.key)} : ${CAL_STYLE[c.kind].label}`}
                            className={`tabular flex h-8 items-center justify-center rounded-md border text-xs ${CAL_STYLE[c.kind].cls}`}
                          >
                            <span className="flex flex-col items-center leading-none">
                              {c.date.getDate()}
                              {(c.date.getDate() === 1 || c.key === stats.calendar[0]?.key) && (
                                <span className="mt-0.5 text-[9px] font-medium uppercase opacity-80">
                                  {c.date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}
                                </span>
                              )}
                            </span>
                          </span>
                        ) : (
                          <span key={`e-${wi}-${ci}`} role="gridcell" aria-hidden="true" />
                        ),
                      )}
                    </div>
                  ))}
                  </div>
                </div>
                <ul className="mt-2 grid shrink-0 grid-cols-3 gap-x-2 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                  {(["normal", "late", "incomplete", "leave", "absent"] as CalendarKind[]).map((k) => (
                    <li key={k} className="flex items-center gap-1.5">
                      <span className={`size-3 rounded-sm border ${CAL_STYLE[k].cls}`} aria-hidden="true" />
                      {CAL_STYLE[k].label}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3 py-4 shadow-none">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-base font-semibold">Détail jour par jour</CardTitle>
          <CardDescription className="text-xs">
            {dailyRows.length} jour{dailyRows.length > 1 ? "s" : ""} pointé{dailyRows.length > 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {dailyRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Aucun pointage sur cette période — élargissez les dates pour voir votre historique.
            </p>
          ) : (
            <>
              <table className="hidden w-full text-sm sm:table">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Jour</th>
                    <th className="py-2 pr-3 font-medium">Arrivée</th>
                    <th className="py-2 pr-3 font-medium">Départ</th>
                    <th className="py-2 pr-3 text-right font-medium">Sessions</th>
                    <th className="py-2 pr-3 text-right font-medium">Durée</th>
                    <th className="py-2 text-right font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((r) => (
                    <tr key={r.dateKey} className="h-11 border-t border-border">
                      <td className="pr-3 first-letter:uppercase">{fmtDay(r.dateKey)}</td>
                      <td className="tabular pr-3">{r.entry ?? "—"}</td>
                      <td className="tabular pr-3">{r.exit ?? "—"}</td>
                      <td className="tabular pr-3 text-right">{r.sessions}</td>
                      <td className="tabular pr-3 text-right">{r.minutes > 0 ? formatMinutesHuman(r.minutes) : "—"}</td>
                      <td className="text-right"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-border sm:hidden">
                {dailyRows.map((r) => (
                  <li key={r.dateKey} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium first-letter:uppercase">{fmtDay(r.dateKey)}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {r.entry ?? "—"} → {r.exit ?? "—"} · {r.minutes > 0 ? formatMinutesHuman(r.minutes) : "—"}
                        {r.sessions > 1 ? ` · ${r.sessions} sessions` : ""}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
