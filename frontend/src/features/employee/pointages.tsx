"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import type { Pointage } from "@/types/models";
import { PresenceChart } from "@/components/charts/presence-chart";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { EmployeeReportDateRangeFilter } from "@/features/manager/employee-report-date-range-filter";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { formatMinutesHuman } from "@/lib/time-format";

interface EmployeePointagesClientProps {
  pointages: Pointage[];
  canEdit: boolean;
  /** Server-resolved ISO date strings ensuring client shows exactly the fetched range */
  resolvedFrom?: string;
  resolvedTo?: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "normal":
      return (
        <Badge
          variant="outline"
          className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200"
        >
          À l&apos;heure
        </Badge>
      );
    case "late":
      return (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/40 dark:text-amber-200"
        >
          Retard
        </Badge>
      );
    case "incomplete":
      return (
        <Badge
          variant="outline"
          className="border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-900/40 dark:text-sky-200"
        >
          Incomplet
        </Badge>
      );
    case "admin_closed":
      return (
        <Badge
          variant="outline"
          className="border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800/60 dark:bg-blue-900/40 dark:text-blue-200"
        >
          Clôturé admin
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

const pointagesColumns: ColumnDef<Pointage>[] = [
  {
    accessorKey: "date",
    header: () => (
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Date
      </span>
    ),
    cell: ({ row }) => {
      const d = new Date(row.original.date);
      const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" });
      const dateStr = d.toLocaleDateString("fr-FR");
      return (
        <span className="font-medium whitespace-nowrap">
          <span className="capitalize">{dayName}</span>{" "}
          <span className="text-muted-foreground">{dateStr}</span>
        </span>
      );
    },
  },
  {
    accessorKey: "entryTime",
    header: () => (
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Entrée
      </span>
    ),
    cell: ({ row }) => <span>{row.original.entryTime || "-"}</span>,
  },
  {
    accessorKey: "exitTime",
    header: () => (
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sortie
      </span>
    ),
    cell: ({ row }) => <span>{row.original.exitTime || "-"}</span>,
  },
  {
    accessorKey: "duration",
    header: () => (
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Durée
      </span>
    ),
    cell: ({ row }) => {
      const duration = row.original.duration ?? 0;
      if (duration <= 0) return <span>-</span>;
      return <span>{formatMinutesHuman(duration)}</span>;
    },
  },
  {
    accessorKey: "status",
    header: () => (
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Statut
      </span>
    ),
    cell: ({ row }) => getStatusBadge(row.original.status),
  },
  {
    accessorKey: "lateReason",
    header: () => (
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Motif
      </span>
    ),
    cell: ({ row }) => {
      const reason = row.original.lateReason ?? null;
      if (!reason) return <span className="text-xs text-muted-foreground">-</span>;
      const truncated = reason.length > 80 ? `${reason.slice(0, 77)}…` : reason;
      return <span className="text-xs">{truncated}</span>;
    },
  },
];

export default function EmployeePointagesClient({ pointages, resolvedFrom, resolvedTo }: EmployeePointagesClientProps) {
  const searchParams = useSearchParams();

  const { from, to: _to, days, rangeLabel } = useMemo(() => {
    // Prefer server-resolved dates; fall back to URL params or today
    const parseLocal = (value: string) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
      return new Date(value);
    };
    const today = new Date();
    const fromStr = resolvedFrom ?? searchParams?.get("from") ?? null;
    const toStr = resolvedTo ?? searchParams?.get("to") ?? null;

    const fromDate = fromStr ? parseLocal(fromStr) : new Date(today);
    const toDate = toStr ? parseLocal(toStr) : new Date(today);

    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const diffDays = Math.max(
      1,
      Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
    );
    const label = `${fromDate.toLocaleDateString("fr-FR")} – ${toDate.toLocaleDateString("fr-FR")}`;
    return { from: fromDate, to: toDate, days: diffDays, rangeLabel: label };
  }, [resolvedFrom, resolvedTo, searchParams]);

  // All pointages come pre-filtered from the server; just sort them
  const userPointages = useMemo(() => {
    return [...pointages].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [pointages]);

  const presenceData = Array.from({ length: days }, (_, i) => {
    const date = new Date(from);
    date.setDate(date.getDate() + i);

    const hasPointage = userPointages.some((p) => {
      const pDate = new Date(p.date);
      return (
        pDate.getFullYear() === date.getFullYear() &&
        pDate.getMonth() === date.getMonth() &&
        pDate.getDate() === date.getDate()
      );
    });

    const presents = hasPointage ? 1 : 0;
    const absents = hasPointage ? 0 : 1;

    return {
      date: date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      presents,
      absents,
      total: presents + absents,
    };
  });

  const workDurationData = Array.from({ length: days }, (_, i) => {
    const date = new Date(from);
    date.setDate(date.getDate() + i);

    const dayPointages = userPointages.filter((p) => {
      const pDate = new Date(p.date);
      return (
        pDate.getFullYear() === date.getFullYear() &&
        pDate.getMonth() === date.getMonth() &&
        pDate.getDate() === date.getDate()
      );
    });

    const totalDurationMinutes = dayPointages.reduce((sum, p) => sum + (p.duration || 0), 0);
    const durationHours = totalDurationMinutes / 60;
    const hasPointage = dayPointages.length > 0;
    const hasLate = dayPointages.some((p) => p.status === "late");
    const hasIncomplete = dayPointages.some((p) => p.status === "incomplete");

    return {
      date: date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      durationHours,
      hasPointage,
      hasLate,
      hasIncomplete,
    };
  });

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
          Mes pointages
        </h1>
        <p className="text-sm text-muted-foreground">
          Vue d&apos;ensemble de votre présence et de vos pointages sur la période sélectionnée.
        </p>
      </div>

      <div className="flex justify-start sm:justify-end">
        <div className="w-full sm:max-w-xs">
          <EmployeeReportDateRangeFilter />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PresenceChart
          data={presenceData}
          title={`Mes présences sur les ${rangeLabel}`}
          description={`Présence ou absence quotidienne sur les ${rangeLabel.toLowerCase()}`}
        />

        <Card className="border border-primary/20 rounded-xl shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
              <Clock className="h-5 w-5 text-primary" />
              <span>Durée de travail quotidienne</span>
            </CardTitle>
            <CardDescription>
              Heures travaillées par jour sur les {rangeLabel.toLowerCase()}.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-2">
            <ResponsiveContainer width="100%" height="100%" minHeight={200} aspect={2.5}>
              <LineChart data={workDurationData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as (typeof workDurationData)[number];
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm text-sm">
                          <div className="font-medium mb-1">{label}</div>
                          <div className="flex flex-col gap-1">
                            <span>
                              <span className="text-[0.70rem] uppercase text-muted-foreground mr-1">Durée</span>
                              <span className="font-bold">{formatMinutesHuman(Math.round(data.durationHours * 60))}</span>
                            </span>
                            {data.hasPointage ? (
                              <span className="text-[0.70rem] uppercase text-muted-foreground">
                                {data.hasLate
                                  ? "Statut : Retard"
                                  : data.hasIncomplete
                                  ? "Statut : Incomplet"
                                  : "Statut : Normal"}
                              </span>
                            ) : (
                              <span className="text-[0.70rem] uppercase text-muted-foreground">Aucun pointage</span>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="durationHours"
                  stroke="hsl(221, 83%, 53%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      

      <Card className="border border-primary/20 rounded-xl shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
            <Clock className="h-5 w-5 text-primary" />
            <span>Historique des pointages</span>
          </CardTitle>
          <CardDescription>
            Vue simplifiée de vos derniers pointages avec les informations essentielles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={pointagesColumns} data={userPointages} pageSize={15} />
        </CardContent>
      </Card>
    </div>
  );
}
