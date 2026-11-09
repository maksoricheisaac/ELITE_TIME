"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Clock,
  CalendarDays,
  TimerReset,
  AlarmClockOff,
  Hourglass,
  Percent,
  CalendarX,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { Pointage, Absence } from "@/types/models";
import { PresenceChart } from "@/components/charts/presence-chart";
import { RetardChart } from "@/components/charts/retard-chart";
import { EmployeeReportDateRangeFilter } from "@/features/manager/employee-report-date-range-filter";
import { formatMinutesHuman } from "@/lib/time-format";

interface MonRapportClientProps {
  pointages: Pointage[];
  absences: Absence[];
  workStartTime: string;
  businessDays: number;
  resolvedFrom: string;
  resolvedTo: string;
  userFirstname: string;
}

function getDayKeyLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = "text-foreground",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="space-y-1 rounded-lg border bg-background/60 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

export default function MonRapportClient({
  pointages,
  absences,
  workStartTime,
  businessDays,
  resolvedFrom,
  resolvedTo,
  userFirstname,
}: MonRapportClientProps) {
  const [startHour, startMinute] = useMemo(
    () => workStartTime.split(":").map(Number),
    [workStartTime],
  );

  const stats = useMemo(() => {
    // Regroupe les sessions par jour (un jour peut avoir plusieurs pointages / sessions).
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

    for (const { sessions } of dayGroups) {
      const first = sessions[0];
      let lateMinutes = 0;
      if (first?.entryTime && !Number.isNaN(startHour)) {
        const [eh, em] = first.entryTime.split(":").map(Number);
        if (!Number.isNaN(eh)) {
          const diff = eh * 60 + em - (startHour * 60 + startMinute);
          if (diff > 0) lateMinutes = diff;
        }
      }
      const isLate = sessions.some((p) => p.status === "late") || lateMinutes > 0;
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
    }

    const avgLateMinutes = lateCount > 0 ? totalLateMinutes / lateCount : 0;
    const punctualityRate = workedDays > 0 ? ((workedDays - lateCount) / workedDays) * 100 : 100;

    // Absences approuvées dans la période, calculées à partir des jours ouvrés non travaillés.
    const workedDayKeys = new Set(dayGroups.map((g) => g.dateKey));
    const approvedAbsences = absences.filter((a) => a.status === "approved");
    const from = new Date(`${resolvedFrom}T00:00:00`);
    const to = new Date(`${resolvedTo}T23:59:59`);
    let absenceCount = 0;
    const cur = new Date(from);
    while (cur <= to) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) {
        const key = getDayKeyLocal(cur);
        if (!workedDayKeys.has(key)) {
          const covered = approvedAbsences.some((a) => {
            const s = new Date(a.startDate);
            const e = new Date(a.endDate);
            s.setHours(0, 0, 0, 0);
            e.setHours(23, 59, 59, 999);
            return cur >= s && cur <= e;
          });
          if (covered) absenceCount += 1;
        }
      }
      cur.setDate(cur.getDate() + 1);
    }

    const presenceRate = businessDays > 0 ? (workedDays / businessDays) * 100 : 0;

    return {
      totalMinutes,
      workedDays,
      avgMinutesPerDay,
      lateCount,
      totalLateMinutes,
      avgLateMinutes,
      punctualityRate,
      absenceCount,
      incompleteCount,
      completeDays,
      presenceRate,
      dayGroups,
    };
  }, [pointages, absences, startHour, startMinute, businessDays, resolvedFrom, resolvedTo]);

  const presenceData = useMemo(() => {
    const from = new Date(`${resolvedFrom}T00:00:00`);
    const to = new Date(`${resolvedTo}T23:59:59`);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
    const workedDayKeys = new Set(stats.dayGroups.map((g) => g.dateKey));

    return Array.from({ length: days }, (_, i) => {
      const date = new Date(from);
      date.setDate(date.getDate() + i);
      const key = getDayKeyLocal(date);
      const present = workedDayKeys.has(key) ? 1 : 0;
      return {
        date: date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        presents: present,
        absents: present ? 0 : 1,
        total: 1,
      };
    });
  }, [resolvedFrom, resolvedTo, stats.dayGroups]);

  const retardData = useMemo(() => {
    return stats.dayGroups.map(({ dateKey, sessions }) => {
      const first = sessions[0];
      let lateMinutes = 0;
      if (first?.entryTime && !Number.isNaN(startHour)) {
        const [eh, em] = first.entryTime.split(":").map(Number);
        if (!Number.isNaN(eh)) {
          const diff = eh * 60 + em - (startHour * 60 + startMinute);
          if (diff > 0) lateMinutes = diff;
        }
      }
      const date = new Date(`${dateKey}T00:00:00`);
      return {
        date: date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        retards: lateMinutes > 0 ? 1 : 0,
        moyenneRetard: lateMinutes,
      };
    });
  }, [stats.dayGroups, startHour, startMinute]);

  const rangeLabel = useMemo(() => {
    const from = new Date(`${resolvedFrom}T00:00:00`);
    const to = new Date(`${resolvedTo}T00:00:00`);
    return `${from.toLocaleDateString("fr-FR")} – ${to.toLocaleDateString("fr-FR")}`;
  }, [resolvedFrom, resolvedTo]);

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
            Mon rapport
          </h1>
          <p className="text-sm text-muted-foreground">
            {userFirstname ? `Tableau de bord personnel de ${userFirstname}` : "Votre tableau de bord personnel"} — période : {rangeLabel}.
          </p>
        </div>
        <div className="w-full sm:w-auto sm:max-w-xs">
          <EmployeeReportDateRangeFilter />
        </div>
      </div>

      {/* Résumé */}
      <Card className="border border-primary/20 rounded-xl shadow-md">
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">Résumé</CardTitle>
          <CardDescription>Vue d&apos;ensemble de votre activité sur la période sélectionnée.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={CheckCircle2}
              label="Présence globale"
              value={`${Math.round(stats.presenceRate)}%`}
              accent="text-emerald-600 dark:text-emerald-400"
            />
            <StatCard
              icon={AlarmClockOff}
              label="Retards"
              value={String(stats.lateCount)}
              accent="text-amber-600 dark:text-amber-400"
            />
            <StatCard
              icon={CalendarX}
              label="Absences"
              value={String(stats.absenceCount)}
              accent="text-destructive"
            />
            <StatCard
              icon={Clock}
              label="Temps travaillé"
              value={formatMinutesHuman(stats.totalMinutes)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Temps de travail */}
      <Card className="border border-primary/20 rounded-xl shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
            <Clock className="h-5 w-5 text-primary" />
            <span>Temps de travail</span>
          </CardTitle>
          <CardDescription>Volume horaire réalisé sur la période.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <StatCard icon={Clock} label="Heures travaillées" value={formatMinutesHuman(stats.totalMinutes)} />
            <StatCard icon={CalendarDays} label="Jours travaillés" value={String(stats.workedDays)} />
            <StatCard icon={TimerReset} label="Temps moyen / jour" value={formatMinutesHuman(stats.avgMinutesPerDay)} />
          </div>
        </CardContent>
      </Card>

      {/* Ponctualité */}
      <Card className="border border-primary/20 rounded-xl shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
            <AlarmClockOff className="h-5 w-5 text-primary" />
            <span>Ponctualité</span>
          </CardTitle>
          <CardDescription>Suivi de vos retards sur la période.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={AlarmClockOff} label="Nombre de retards" value={String(stats.lateCount)} accent="text-amber-600 dark:text-amber-400" />
            <StatCard icon={Hourglass} label="Durée totale des retards" value={formatMinutesHuman(stats.totalLateMinutes)} />
            <StatCard icon={Hourglass} label="Durée moyenne des retards" value={formatMinutesHuman(stats.avgLateMinutes)} />
            <StatCard icon={Percent} label="Taux de ponctualité" value={`${Math.round(stats.punctualityRate)}%`} accent="text-emerald-600 dark:text-emerald-400" />
          </div>
        </CardContent>
      </Card>

      {/* Présence */}
      <Card className="border border-primary/20 rounded-xl shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
            <CalendarDays className="h-5 w-5 text-primary" />
            <span>Présence</span>
          </CardTitle>
          <CardDescription>Répartition de vos jours d&apos;absence et de présence complète.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <StatCard icon={CalendarX} label="Jours d'absence" value={String(stats.absenceCount)} accent="text-destructive" />
            <StatCard icon={AlertTriangle} label="Pointages incomplets" value={String(stats.incompleteCount)} accent="text-sky-600 dark:text-sky-400" />
            <StatCard icon={CheckCircle2} label="Jours parfaitement complétés" value={String(stats.completeDays)} accent="text-emerald-600 dark:text-emerald-400" />
          </div>
        </CardContent>
      </Card>

      {/* Graphiques */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PresenceChart
          data={presenceData}
          title="Ma présence"
          description={`Présence ou absence quotidienne sur la période sélectionnée`}
        />
        <RetardChart
          data={retardData}
          title="Mes retards"
          description="Jours avec retard sur la période sélectionnée"
        />
      </div>
    </div>
  );
}
