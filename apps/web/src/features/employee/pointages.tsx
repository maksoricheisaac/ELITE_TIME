"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock } from "lucide-react";
import type { Pointage } from "@/types/models";
import { DailyHoursChart } from "@/components/charts/daily-hours-chart";
import { PresenceChart } from "@/components/charts/presence-chart";
import { EmployeeReportDateRangeFilter } from "@/features/manager/employee-report-date-range-filter";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { formatMinutesHuman } from "@/lib/time-format";

/**
 * Registre des filtres de statut disponibles pour le tableau des pointages.
 * Ajouter une entrée ici suffit pour faire apparaître un nouveau filtre
 * dans le sélecteur (ex: "absent", "teletravail", ...), à condition que
 * `match` sache reconnaître le pointage correspondant.
 */
const STATUS_FILTERS: { value: string; label: string; match: (p: Pointage) => boolean }[] = [
  { value: "normal", label: "À l'heure", match: (p) => p.status === "normal" },
  { value: "late", label: "En retard", match: (p) => p.status === "late" },
  { value: "incomplete", label: "Incomplet", match: (p) => p.status === "incomplete" },
  { value: "admin_closed", label: "Clôturé admin", match: (p) => p.status === "admin_closed" },
];

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
          className="border-success/30 bg-success-soft text-success"
        >
          À l&apos;heure
        </Badge>
      );
    case "late":
      return (
        <Badge
          variant="outline"
          className="border-warning/30 bg-warning-soft text-warning"
        >
          Retard
        </Badge>
      );
    case "incomplete":
      return (
        <Badge
          variant="outline"
          className="border-info/30 bg-info-soft text-info"
        >
          Incomplet
        </Badge>
      );
    case "admin_closed":
      return (
        <Badge
          variant="outline"
          className="border-info/30 bg-info-soft text-info"
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
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  // All pointages come pre-filtered (date range) from the server; sort then apply the status filter
  const userPointages = useMemo(() => {
    return [...pointages].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [pointages]);

  const filteredPointages = useMemo(() => {
    if (statusFilter === "all") return userPointages;
    const filter = STATUS_FILTERS.find((f) => f.value === statusFilter);
    if (!filter) return userPointages;
    return userPointages.filter(filter.match);
  }, [userPointages, statusFilter]);

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
        <h1 className="text-xl font-semibold tracking-[-0.022em] text-foreground sm:text-2xl">
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

        <DailyHoursChart
          title="Durée de travail quotidienne"
          description={`Heures travaillées par jour sur les ${rangeLabel.toLowerCase()}`}
          data={workDurationData
            .filter((d) => d.hasPointage)
            .map((d) => ({
              label: d.date,
              hours: Math.round(d.durationHours * 10) / 10,
              kind: d.hasIncomplete ? ("incomplete" as const) : d.hasLate ? ("late" as const) : ("normal" as const),
            }))}
        />
      </div>
      

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                <Clock className="h-5 w-5 text-primary" />
                <span>Historique des pointages</span>
              </CardTitle>
              <CardDescription>
                Vue simplifiée de vos derniers pointages avec les informations essentielles.
              </CardDescription>
            </div>
            <div className="space-y-1 w-full sm:w-56 sm:shrink-0">
              <Label className="text-xs text-muted-foreground">Statut</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filtrer par statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {STATUS_FILTERS.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredPointages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun pointage ne correspond à ce filtre.
            </p>
          ) : (
            <DataTable columns={pointagesColumns} data={filteredPointages} pageSize={15} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
