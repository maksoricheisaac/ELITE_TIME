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
              className="w-fit border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/40 dark:text-amber-200"
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
            className="border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-900/40 dark:text-sky-200"
          >
            Incomplet
          </Badge>
        );
      }

      if (status === "admin_closed") {
        return (
          <Badge
            variant="outline"
            className="border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800/60 dark:bg-blue-900/40 dark:text-blue-200"
          >
            Clôturé admin
          </Badge>
        );
      }

      return (
        <div className="flex flex-col gap-1">
          <Badge
            variant="outline"
            className="w-fit border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200"
          >
            À l&apos;heure
          </Badge>
          {row.original.earlyExitReason && (
            <span className="text-[10px] text-blue-600/80 italic max-w-[150px] truncate" title={row.original.earlyExitReason}>
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
