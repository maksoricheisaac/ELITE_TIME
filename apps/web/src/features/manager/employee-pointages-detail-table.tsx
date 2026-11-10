"use client";

import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatMinutesHuman } from "@/lib/time-format";
import { formatTimeToHHMM } from "@/lib/time-format";

export interface EmployeePointageDetailRow {
  id: string;
  date: string; // ISO string
  entryTime: string | null;
  exitTime: string | null;
  duration: number | null;
  status: string | null;
  pauseMinutes: number;
  lateMinutes?: number;
  lateReason?: string | null;
  earlyExitReason?: string | null;
  /** Numéro de session (vue brute) ou nombre de sessions agrégées */
  sessionNumber?: number;
  /** Nombre de sessions pour la journée (vue agrégée par jour) */
  sessionCount?: number;
}

interface EmployeePointagesDetailTableProps {
  rows: EmployeePointageDetailRow[];
}

function formatMinutesHHMM(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

const columns: ColumnDef<EmployeePointageDetailRow>[] = [
  {
    id: "session",
    header: () => <span>Sessions</span>,
    cell: ({ row }) => {
      const count = row.original.sessionCount ?? row.original.sessionNumber ?? 1;
      return (
        <Badge variant={count > 1 ? "default" : "outline"} className="font-mono">
          {count > 1 ? `×${count}` : "1"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "date",
    header: () => <span>Date</span>,
    cell: ({ row }) => {
      const d = new Date(row.original.date);
      const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" });
      const dateStr = d.toLocaleDateString("fr-FR");
      return (
        <span className="whitespace-nowrap">
          <span className="capitalize text-muted-foreground font-medium">{dayName}</span>{" "}
          <span className="text-muted-foreground">{dateStr}</span>
        </span>
      );
    },
  },
  {
    accessorKey: "entryTime",
    header: () => <span>Entrée</span>,
    cell: ({ row }) => <span>{formatTimeToHHMM(row.original.entryTime) || "-"}</span>,
  },
  {
    accessorKey: "exitTime",
    header: () => <span>Sortie</span>,
    cell: ({ row }) => <span>{formatTimeToHHMM(row.original.exitTime) || "-"}</span>,
  },
  {
    accessorKey: "duration",
    header: () => <span>Durée</span>,
    cell: ({ row }) => {
      const duration = row.original.duration;
      if (!duration || duration <= 0) {
        return <span>-</span>;
      }
      return <span>{formatMinutesHuman(duration)}</span>;
    },
  },
  {
    accessorKey: "lateMinutes",
    header: () => <span>Retard</span>,
    cell: ({ row }) => {
      const late = row.original.lateMinutes ?? 0;
      if (!late || late <= 0) {
        return <span>-</span>;
      }
      return <span className="text-destructive font-medium">{formatMinutesHHMM(late)}</span>;
    },
  },
  {
    accessorKey: "pauseMinutes",
    header: () => <span>Pauses</span>,
    cell: ({ row }) => {
      const pauseMinutes = row.original.pauseMinutes;
      if (!pauseMinutes || pauseMinutes <= 0) {
        return <span>-</span>;
      }
      return <span>{formatMinutesHuman(pauseMinutes)}</span>;
    },
  },
  {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => {
      const status = row.original.status;

      if (status === "late") {
        return (
          <div className="flex flex-col gap-1">
            <Badge
              variant="outline"
              className="w-fit border-warning/30 bg-warning-soft text-warning"
            >
              En retard
            </Badge>
            {row.original.lateReason && (
              <span className="text-[10px] text-muted-foreground italic max-w-[150px] truncate" title={row.original.lateReason}>
                Raison: {row.original.lateReason}
              </span>
            )}
          </div>
        );
      }

      if (status === "incomplete") {
        return (
          <Badge
            variant="outline"
            className="border-info/30 bg-info-soft text-info"
          >
            Incomplet
          </Badge>
        );
      }

      if (status === "admin_closed") {
        return (
          <Badge
            variant="outline"
            className="border-info/30 bg-info-soft text-info"
          >
            Clôturé admin
          </Badge>
        );
      }

      return (
        <div className="flex flex-col gap-1">
          <Badge
            variant="outline"
            className="w-fit border-success/30 bg-success-soft text-success"
          >
            À l&apos;heure
          </Badge>
          {row.original.earlyExitReason && (
            <span className="text-[10px] text-info italic max-w-[150px] truncate" title={row.original.earlyExitReason}>
              Sortie: {row.original.earlyExitReason}
            </span>
          )}
        </div>
      );
    },
  },
];

export function EmployeePointagesDetailTable({ rows }: EmployeePointagesDetailTableProps) {
  return <DataTable columns={columns} data={rows} pageSize={15} />;
}
