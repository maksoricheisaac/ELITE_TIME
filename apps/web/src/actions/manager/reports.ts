"use server";

import { serverGet } from "@/lib/server-api";
import type { User, Pointage, Break, Absence, SystemSettings } from "@/types/models";

export interface ReportsTeamData {
  team: User[];
  pointages: Pointage[];
  breaks: Break[];
  absences: Absence[];
  overtimeThreshold: number;
}

async function fetchReportsData(): Promise<ReportsTeamData> {
  const [raw, settings, absences] = await Promise.all([
    serverGet<{ users: User[]; pointages: Pointage[]; breaks: Break[] }>("/reports/team?days=90"),
    serverGet<SystemSettings>("/settings"),
    serverGet<Absence[]>("/absences/team"),
  ]);
  const rawData = raw as { users?: User[]; pointages?: Pointage[]; breaks?: Break[] } | null;
  const settingsData = settings as { overtimeThreshold?: number } | null;
  return {
    team: rawData?.users ?? [],
    pointages: rawData?.pointages ?? [],
    breaks: rawData?.breaks ?? [],
    absences: absences ?? [],
    overtimeThreshold: settingsData?.overtimeThreshold ?? 40,
  };
}

export async function managerGetReportsData(_managerId: string): Promise<ReportsTeamData> {
  return fetchReportsData();
}

export async function teamLeadGetReportsData(_teamLeadId: string): Promise<ReportsTeamData> {
  return fetchReportsData();
}
