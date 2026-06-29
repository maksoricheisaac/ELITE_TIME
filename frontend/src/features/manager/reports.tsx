"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useNotification } from "@/contexts/notification-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, Users, FileSpreadsheet, ExternalLink } from "lucide-react";
import { EmployeeReportDateRangeFilter } from "@/features/manager/employee-report-date-range-filter";
import type { User, Pointage, Break as BreakModel, Absence } from "@/types/models";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { formatMinutesHuman } from "@/lib/time-format";

interface ManagerReportsClientProps {
  team: User[];
  pointages: Pointage[];
  breaks: BreakModel[];
  absences: Absence[];
  overtimeThreshold: number;
  canExportPdf?: boolean;
  canExportExcel?: boolean;
}


interface EmployeeStats {
  employee: User;
  totalWorkMinutes: number;
  lateCount: number;
  absenceCount: number;
  overtimeMinutes: number;
  totalBreakMinutes: number;
  source: string;

}

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


export default function ManagerReportsClient({
  team,
  pointages,
  breaks,
  absences,
  overtimeThreshold,
  canExportPdf = false,
  canExportExcel = false,
}: ManagerReportsClientProps) {
  const { showSuccess, showError, showInfo } = useNotification();
  const [searchTerm, setSearchTerm] = useState("");

  const [filterDepartment, setFilterDepartment] = useState<string>("all");

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const searchParams = useSearchParams();



  const toDateParam = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };



  const { from, to, rangeLabel } = useMemo(() => {

    const fromParam = searchParams?.get("from") ?? undefined;

    const toParam = searchParams?.get("to") ?? undefined;



    const today = new Date();

    const defaultFrom = new Date(today);

    defaultFrom.setDate(today.getDate() - 30);

    defaultFrom.setHours(0, 0, 0, 0);

    

    const defaultTo = new Date(today);

    defaultTo.setHours(23, 59, 59, 999);



    const fromDate = fromParam ? new Date(fromParam) : defaultFrom;

    const toDate = toParam ? new Date(toParam) : defaultTo;



    const fromLabel = fromDate.toLocaleDateString("fr-FR");

    const toLabel = toDate.toLocaleDateString("fr-FR");



    let label = "Choisir une période";

    if (fromLabel && !toLabel) {

      label = fromLabel;

    } else if (!fromLabel && toLabel) {

      label = toLabel;

    } else if (fromLabel && toLabel && fromLabel === toLabel) {

      label = fromLabel;

    } else if (fromLabel && toLabel) {

      label = `${fromLabel} – ${toLabel}`;

    }



    return { from: fromDate, to: toDate, rangeLabel: label };

  }, [searchParams]);



  const periodFilteredPointages = useMemo(() => {

    return pointages.filter((p) => {

      const d = new Date(p.date as unknown as string);

      return d >= from && d <= to;

    });

  }, [pointages, from, to]);



  const periodFilteredBreaks = useMemo(() => {

    return breaks.filter((b) => {

      const d = new Date(b.date as unknown as string);

      return d >= from && d <= to;

    });

  }, [breaks, from, to]);



  const stats: EmployeeStats[] = useMemo(() => {

    const businessDays = countBusinessDays(from, to);

    const threshold = overtimeThreshold || 40;



    return team.map((employee) => {

      const employeePointages = periodFilteredPointages.filter(

        (p) => p.userId === employee.id

      );



      const employeeBreaks = periodFilteredBreaks.filter(

        (b) => b.userId === employee.id

      );



      const totalMinutes = employeePointages.reduce((sum, p) => sum + p.duration, 0);

      const totalBreakMinutes = employeeBreaks.reduce(

        (sum, b) => sum + (b.duration || 0),

        0

      );

      const lateCount = employeePointages.filter((p) => p.status === "late").length;



      const workedDayKeys = new Set(

        employeePointages.map((p) => {

          const d = new Date(p.date as unknown as string);

          return d.toDateString();

        })

      );

      const employeeAbsences = absences.filter((a) => a.userId === employee.id);

      let absenceCount = 0;

      const cur = new Date(from);

      cur.setHours(0, 0, 0, 0);

      const end = new Date(to);

      end.setHours(23, 59, 59, 999);

      while (cur <= end) {

        const dow = cur.getDay();

        if (dow !== 0 && dow !== 6) {

          if (!workedDayKeys.has(cur.toDateString())) {

            const covered = employeeAbsences.some((a) => {

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



      const expectedMinutes = Math.round((businessDays / 5) * threshold * 60);
      const overtimeMinutes = Math.max(0, totalMinutes - expectedMinutes);



      const lastPointage = employeePointages[0];

      const source = lastPointage?.source ?? "EMPLOYEE";



      return {

        employee,

        totalWorkMinutes: totalMinutes,

        lateCount,

        absenceCount,

        overtimeMinutes,

        totalBreakMinutes,

        source,

      };

    });

  }, [team, periodFilteredPointages, periodFilteredBreaks, absences, from, to, overtimeThreshold]);



  const departments = useMemo(

    () =>

      Array.from(

        new Set(

          team

            .map((e) => e.department)

            .filter((d): d is string => Boolean(d))

        )

      ),

    [team]

  );



  const filteredStats = useMemo(() => {

    const term = searchTerm.trim().toLowerCase();

    return stats.filter(({ employee }) => {

      const matchesSearch = term

        ? `${employee.firstname} ${employee.lastname}`

            .toLowerCase()

            .includes(term)

        : true;



      const matchesDepartment =

        filterDepartment === "all" || employee.department === filterDepartment;



      return matchesSearch && matchesDepartment;

    });

  }, [stats, searchTerm, filterDepartment]);



  const totalTeamMinutes = filteredStats.reduce((sum, s) => sum + s.totalWorkMinutes, 0);

  const avgMinutes = filteredStats.length > 0 ? Math.round(totalTeamMinutes / filteredStats.length) : 0;

  const totalOvertimeMinutes = filteredStats.reduce((sum, s) => sum + s.overtimeMinutes, 0);






  const employeeStatsColumns: ColumnDef<EmployeeStats>[] = useMemo(

    () => [

      {

        accessorKey: "employee",

        header: () => <span>Employé</span>,

        cell: ({ row }) => {

          const employee = row.original.employee;

          return (

            <span className="font-medium">

              {employee.firstname} {employee.lastname}

            </span>

          );

        },

      },

      {

        accessorKey: "department",

        header: () => <span>Département</span>,

        cell: ({ row }) => <span>{row.original.employee.department}</span>,

      },

      {

        accessorKey: "source",

        header: () => <span>Source</span>,

        cell: ({ row }) => {

          const source = row.original.source;

          const label = source === "EMPLOYEE" ? "Employé" : source === "MANAGER" ? "Manager" : "Admin";

          const variant = source === "EMPLOYEE" ? "outline" : "secondary";

          return (

            <Badge variant={variant} className="text-[10px] px-1 py-0 h-4 uppercase">

              {label}

            </Badge>

          );

        },

      },

      {

        accessorKey: "totalWorkMinutes",

        header: () => <span>Heures travaillées</span>,

        cell: ({ row }) => <span>{formatMinutesHuman(row.original.totalWorkMinutes)}</span>,

      },

      {

        accessorKey: "lateCount",

        header: () => <span>Retards</span>,

        cell: ({ row }) => {

          const value = row.original.lateCount;

          return <span className={value > 0 ? "text-destructive font-semibold" : ""}>{value}</span>;

        },

      },

      {

        accessorKey: "absenceCount",

        header: () => <span>Absences</span>,

        cell: ({ row }) => {

          const value = row.original.absenceCount;

          return <span className={value > 0 ? "text-warning font-semibold" : ""}>{value}</span>;

        },

      },

      {

        accessorKey: "overtimeMinutes",

        header: () => <span>Heures sup</span>,

        cell: ({ row }) => {

          const value = row.original.overtimeMinutes;

          return <span className={value > 0 ? "text-success font-semibold" : ""}>{formatMinutesHuman(value)}</span>;

        },

      },

      {

        id: "actions",

        header: () => <span className="sr-only">Actions</span>,

        cell: ({ row }) => {

          const employeeId = row.original.employee.id;

          const fromParam = toDateParam(from);

          const toParam = toDateParam(to);

          return (

            <Link

              href={`/reports/${employeeId}?from=${fromParam}&to=${toParam}`}

              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium whitespace-nowrap"

              title="Voir le rapport individuel"

            >

              <ExternalLink className="h-3.5 w-3.5" />

              <span>Détail</span>

            </Link>

          );

        },

      },

    ],
    [from, to],
  );



  const handleExportPdf = async () => {

    if (filteredStats.length === 0) {

      showInfo("Aucune donnée à exporter pour cette sélection.");

      return;

    }



    setIsExportingPdf(true);



    try {

      const fromParam = from.toISOString();

      const toParam = to.toISOString();

      const url = `/api/reports/pdf?from=${encodeURIComponent(fromParam)}&to=${encodeURIComponent(toParam)}`;



      const res = await fetch(url);

      if (!res.ok) {

        throw new Error(`HTTP ${res.status}`);

      }



      const blob = await res.blob();

      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");

      a.href = objectUrl;

      a.download = `rapport_pointages_${fromParam.slice(0, 10)}_au_${toParam.slice(0, 10)}.pdf`;

      a.click();

      URL.revokeObjectURL(objectUrl);



      showSuccess("Rapport PDF téléchargé avec succès");

    } catch (error) {

      console.error(error);

      showError("Une erreur est survenue lors de la génération du PDF.");

    } finally {

      setIsExportingPdf(false);

    }

  };



  const handleExportExcel = async () => {

    if (filteredStats.length === 0) {

      showInfo("Aucune donnée à exporter pour cette sélection.");

      return;

    }



    setIsExportingExcel(true);

    try {

      const fromParam = from.toISOString();

      const toParam = to.toISOString();

      const url = `/api/reports/excel?from=${encodeURIComponent(fromParam)}&to=${encodeURIComponent(toParam)}`;

      const filename = `rapport_pointages_${fromParam.slice(0, 10)}_au_${toParam.slice(0, 10)}.xlsx`;



      const res = await fetch(url);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);



      const blob = await res.blob();

      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");

      a.href = objectUrl;

      a.download = filename;

      a.click();

      URL.revokeObjectURL(objectUrl);



      showSuccess("Rapport Excel téléchargé avec succès");

    } catch (error) {

      console.error(error);

      showError("Une erreur est survenue lors de la génération de l'Excel.");

    } finally {

      setIsExportingExcel(false);

    }

  };



  return (

    <div className="space-y-6">

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

        <div>

          <div className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Rapports
          </div>

          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Rapports</h1>

          <p className="text-sm text-muted-foreground mt-1">

            Analyse des performances de l&apos;équipe

          </p>

        </div>

        <div className="flex flex-wrap gap-2 sm:shrink-0">

          {canExportExcel && (
          <Button className="cursor-pointer flex-1 sm:flex-none" variant="outline" onClick={handleExportExcel} disabled={isExportingExcel}>

            <FileSpreadsheet className="mr-2 h-4 w-4" />

            Excel

          </Button>
          )}

          {canExportPdf && (
          <Button className="cursor-pointer flex-1 sm:flex-none" onClick={handleExportPdf} disabled={isExportingPdf}>

            <Download className="mr-2 h-4 w-4" />

            {isExportingPdf ? "Génération..." : "PDF"}

          </Button>
          )}

        </div>

      </div>



      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">

        <div className="space-y-1 sm:col-span-2 lg:col-span-1">

          <EmployeeReportDateRangeFilter />

        </div>



        <div className="space-y-1">
          <Input

            placeholder="Rechercher un employé..."

            className="w-full lg:w-64"

            value={searchTerm}

            onChange={(e) => setSearchTerm(e.target.value)}

          />
        </div>



        {departments.length > 1 && (

          <div className="space-y-1">
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>

            <SelectTrigger className="w-full lg:w-48">

              <SelectValue placeholder="Filtrer par département" />

            </SelectTrigger>

            <SelectContent>

              <SelectItem value="all">Tous les départements</SelectItem>

              {departments.map((dept) => (

                <SelectItem key={dept} value={dept}>

                  {dept}

                </SelectItem>

              ))}

            </SelectContent>

          </Select>
          </div>

        )}

      </div>



      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">Heures totales</CardTitle>

            <Users className="h-4 w-4 text-muted-foreground" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">{formatMinutesHuman(totalTeamMinutes)}</div>

            <p className="text-xs text-muted-foreground">Pour toute l&apos;équipe</p>

          </CardContent>

        </Card>

    

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">Moyenne par employé</CardTitle>

            <Users className="h-4 w-4 text-muted-foreground" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">{formatMinutesHuman(avgMinutes)}</div>

            <p className="text-xs text-muted-foreground">Par employé sur la période</p>

          </CardContent>

        </Card>

    

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">Heures sup totales</CardTitle>

            <Users className="h-4 w-4 text-muted-foreground" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">{formatMinutesHuman(totalOvertimeMinutes)}</div>

            <p className="text-xs text-muted-foreground">Pour toute l&apos;équipe</p>

          </CardContent>

        </Card>

      </div>

    

      <Card>

        <CardHeader>

          <CardTitle>Récapitulatif par employé</CardTitle>

          <CardDescription>

            {rangeLabel}

          </CardDescription>

        </CardHeader>

        <CardContent>

          <DataTable columns={employeeStatsColumns} data={filteredStats} />

        </CardContent>

      </Card>

    </div>

  );

}

