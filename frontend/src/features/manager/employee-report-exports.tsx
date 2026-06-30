"use client";

import { useState } from "react";
import type { EmployeePointageDetailRow } from "@/features/manager/employee-pointages-detail-table";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";
import { useNotification } from "@/contexts/notification-context";

interface EmployeeReportExportsProps {
  employeeId: string;
  employee: {
    firstname: string;
    lastname: string;
    department?: string | null;
  };
  from: string; // ISO
  to: string; // ISO
  rows: EmployeePointageDetailRow[];
  canExportPdf?: boolean;
  canExportExcel?: boolean;
}

function buildEmployeeSlug(firstname: string, lastname: string) {
  const base = `${firstname} ${lastname}`.trim() || "employe";
  return base
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function logReportExport(reportType: string, details?: string) {
  try {
    await fetch("/api/activity/report-export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reportType, details }),
    });
  } catch {
    // best-effort logging, ne pas casser l'UX
  }
}

export function EmployeeReportExports({
  employeeId,
  employee,
  from,
  to,
  rows,
  canExportPdf = false,
  canExportExcel = false,
}: EmployeeReportExportsProps) {
  const { showSuccess, showError, showInfo } = useNotification();
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const hasData = rows.length > 0;
  const fileSlug = buildEmployeeSlug(employee.firstname, employee.lastname);

  const _handleExportCsv = async () => {
    if (!hasData) {
      showInfo("Aucune donnée à exporter pour cette période.");
      return;
    }

    const displayName = `${employee.lastname?.toUpperCase?.() ?? employee.lastname ?? ""} ${employee.firstname ?? ""}`.trim();
    const functionOrService = employee.department ?? "";

    const header = "\uFEFFDate;Noms et prénoms;Fonction/Service;Heure d'arrivée;Heure de départ;Observations\n";
    const data = rows
      .map((r) => {
        const d = new Date(r.date);
        const dateLabel = d.toLocaleDateString("fr-FR");
        const observations = (r as { lateReason?: string }).lateReason ?? "";
        return `${dateLabel};"${displayName}";"${functionOrService}";${r.entryTime ?? ""};${r.exitTime ?? ""};"${observations ?? ""}"`;
      })
      .join("\n");

    const csv = header + data + "\n";

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-${fileSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    const periodDetails = `Employé: ${employee.firstname} ${employee.lastname} – période ${new Date(from).toLocaleDateString("fr-FR")} à ${new Date(to).toLocaleDateString("fr-FR")}`;
    void logReportExport("EMPLOYEE_REPORT_CSV", periodDetails);

    showSuccess("Rapport CSV exporté avec succès");
  };

  const handleExportExcel = async () => {
    if (!hasData) {
      showInfo("Aucune donnée à exporter pour cette période.");
      return;
    }
    try {
      setIsExportingExcel(true);

      const fromIso = new Date(from).toISOString();
      const toIso = new Date(to).toISOString();
      const res = await fetch(
        `/api/reports/excel?employeeId=${encodeURIComponent(employeeId)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
      );

      if (!res.ok) {
        throw new Error(`Excel download failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport-${fileSlug}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      const periodDetails = `Employé: ${employee.firstname} ${employee.lastname} – période ${new Date(from).toLocaleDateString("fr-FR")} à ${new Date(to).toLocaleDateString("fr-FR")}`;
      void logReportExport("EMPLOYEE_REPORT_EXCEL", periodDetails);

      showSuccess("Rapport Excel téléchargé avec succès");
    } catch (error) {
      console.error(error);
      showError("Une erreur est survenue lors de la génération de l'Excel.");
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    if (!hasData) {
      showInfo("Aucune donnée à exporter pour cette période.");
      return;
    }

    try {
      setIsExportingPdf(true);

      const periodDetails = `Employé: ${employee.firstname} ${employee.lastname} – période ${new Date(from).toLocaleDateString("fr-FR")} à ${new Date(to).toLocaleDateString("fr-FR")}`;
      void logReportExport("EMPLOYEE_REPORT_PDF", periodDetails);

      const fromIso = new Date(from).toISOString();
      const toIso = new Date(to).toISOString();
      const res = await fetch(
        `/api/reports/pdf?employeeId=${encodeURIComponent(employeeId)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
      );

      if (!res.ok) {
        throw new Error(`PDF download failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport-${fileSlug}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      showSuccess(" Rapport PDF téléchargé avec succès");
    } catch (error) {
      console.error(error);
      showError("Une erreur est survenue lors de la génération du PDF.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!canExportExcel && !canExportPdf) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canExportExcel && (
        <Button
          className="cursor-pointer"
          variant="outline"
          size="sm"
          onClick={handleExportExcel}
          disabled={!hasData || isExportingExcel}
        >
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
          <span>{isExportingExcel ? "Génération..." : "Excel"}</span>
        </Button>
      )}
      {canExportPdf && (
        <Button
          className="cursor-pointer"
          size="sm"
          onClick={handleExportPdf}
          disabled={!hasData || isExportingPdf}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          <span>{isExportingPdf ? "Génération..." : "PDF"}</span>
        </Button>
      )}
    </div>
  );
}
