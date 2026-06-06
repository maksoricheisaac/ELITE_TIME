"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Search, Filter, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import type { User, ActivityType } from "@/types/models";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { EmployeeReportDateRangeFilter } from "@/features/manager/employee-report-date-range-filter";

export type ActivityLogWithUser = {
  id: string;
  userId: string | null;
  action: string;
  details: string;
  timestamp: Date;
  type: ActivityType;
  user: User | null;
}

interface LogsClientProps {
  logs: {
    logs: ActivityLogWithUser[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
  };
  employees: User[];
  /** Server-resolved ISO date strings so the client always shows the exact fetched range */
  resolvedFrom: string;
  resolvedTo: string;
}

const logColumns: ColumnDef<ActivityLogWithUser>[] = [
  {
    accessorKey: "user",
    header: () => <span>Utilisateur</span>,
    cell: ({ row }) => {
      const user = row.original.user;
      if (!user) return <span>Utilisateur supprimé</span>;
      const label = `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.email;
      return <span>{label}</span>;
    },
  },
  {
    accessorKey: "type",
    header: () => <span>Type</span>,
    cell: ({ row }) => <span>{row.original.type}</span>,
  },
  {
    accessorKey: "action",
    header: () => <span>Action</span>,
    cell: ({ row }) => <span className="font-medium">{row.original.action}</span>,
  },
  {
    accessorKey: "details",
    header: () => <span>Détails</span>,
    cell: ({ row }) => (
      <span className="max-w-[360px] truncate" title={row.original.details}>
        {row.original.details}
      </span>
    ),
  },
  {
    accessorKey: "timestamp",
    header: () => <span>Date &amp; heure</span>,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {new Date(row.original.timestamp).toLocaleString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
    ),
  },
];

export default function LogsClient({ logs: logsData, employees, resolvedFrom, resolvedTo }: LogsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const logs = logsData.logs;
  const totalCount = logsData.totalCount;
  const totalPages = logsData.totalPages;
  const currentPage = logsData.currentPage;

  // All filters are URL-driven so navigation preserves them
  const searchTerm = searchParams?.get("q") ?? "";
  const filterType = searchParams?.get("type") ?? "all";
  const filterUser = searchParams?.get("user") ?? "all";

  const updateParam = useCallback((key: string, value: string, resetPage = true) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (value === "all" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    if (resetPage) params.delete("page");
    router.push(`?${params.toString()}`);
  }, [router, searchParams]);

  const handlePageChange = useCallback((newPage: number) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("page", String(newPage));
    router.push(`?${params.toString()}`);
  }, [router, searchParams]);

  // Client-side text search on the current page only (fast, no extra request)
  const displayedLogs = useMemo(() => {
    if (!searchTerm) return logs;
    const t = searchTerm.toLowerCase();
    return logs.filter((log) => {
      const user = log.user;
      return (
        log.action.toLowerCase().includes(t) ||
        log.details.toLowerCase().includes(t) ||
        (user?.firstname || "").toLowerCase().includes(t) ||
        (user?.lastname || "").toLowerCase().includes(t)
      );
    });
  }, [logs, searchTerm]);

  const totalActiveEmployees = employees.length;
  const connectedUserIds = new Set(
    logs
      .filter((l) => l.type === "auth" && l.userId)
      .map((l) => l.userId as string),
  );
  const nonConnectedCount = Math.max(0, totalActiveEmployees - connectedUserIds.size);


  const handlePrint = async () => {
    if (displayedLogs.length === 0) return;
    try {
      const url = `/api/reports/logs?from=${encodeURIComponent(resolvedFrom)}&to=${encodeURIComponent(resolvedTo)}&limit=10000`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `rapport_logs_${resolvedFrom}_${resolvedTo}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error(error);
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      auth: "bg-primary",
      pointage: "bg-success",
      absence: "bg-warning",
      user: "bg-destructive",
      validation: "bg-accent",
    };
    return (
      <Badge variant="default" className={colors[type] ?? ""}>
        {type}
      </Badge>
    );
  };

  const uniqueUsers = useMemo(() =>
    Array.from(
      new Map(
        logs
          .filter((log) => log.user)
          .map((log) => [log.user!.id, log.user as User])
      ).values()
    ),
    [logs]
  );

  return (
    <div className="space-y-6" suppressHydrationWarning>
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Logs &amp; Activité</h1>
        <p className="text-sm text-muted-foreground sm:text-base">Historique des actions et événements système</p>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { type: "auth", label: "Connexions", count: logs.filter((l) => l.type === "auth").length },
          { type: "pointage", label: "Pointages", count: logs.filter((l) => l.type === "pointage").length },
          { type: "absence", label: "Non connectés", count: nonConnectedCount },
          { type: "user", label: "Utilisateurs", count: logs.filter((l) => l.type === "user").length },
        ].map((stat) => (
          <Card key={stat.type}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.count}</div>
              {getTypeBadge(stat.type)}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="search" className="text-sm text-muted-foreground">Recherche (page actuelle)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Action, utilisateur..."
                  value={searchTerm}
                  onChange={(e) => updateParam("q", e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Type d&apos;action</Label>
              <Select value={filterType} onValueChange={(v) => updateParam("type", v)}>
                <SelectTrigger className="w-full lg:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="auth">Connexions</SelectItem>
                  <SelectItem value="pointage">Pointages</SelectItem>
                  <SelectItem value="user">Utilisateurs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Utilisateur</Label>
              <Select value={filterUser} onValueChange={(v) => updateParam("user", v)}>
                <SelectTrigger className="w-full lg:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {uniqueUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstname} {user.lastname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-1 lg:w-64">
              <Label className="text-sm text-muted-foreground">Période</Label>
              <EmployeeReportDateRangeFilter />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des logs */}
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>
              Historique des activités
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({displayedLogs.length} affichés sur {totalCount} au total)
              </span>
            </CardTitle>
            <CardDescription>
              Page {currentPage} / {totalPages} — {totalCount} log(s) sur la période
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={handlePrint}
              disabled={displayedLogs.length === 0}
            >
              <Printer className="mr-2 h-4 w-4" />
              <span>Imprimer</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {totalCount === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Aucun log trouvé pour cette période</p>
          ) : (
            <>
              <DataTable columns={logColumns} data={displayedLogs} />
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Page {currentPage} / {totalPages} — {totalCount} log(s) total
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      disabled={currentPage <= 1}
                      onClick={() => handlePageChange(currentPage - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Précédent</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      disabled={currentPage >= totalPages}
                      onClick={() => handlePageChange(currentPage + 1)}
                    >
                      <span>Suivant</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
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
