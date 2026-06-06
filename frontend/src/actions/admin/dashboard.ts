"use server";

import { serverGet } from "@/lib/server-api";

interface DepartmentStat { name: string; count: number; }
export interface AdminDashboardStats {
  totalUsers: number;
  employees: number;
  managers: number;
  admins: number;
  activeToday: number;
  departments: DepartmentStat[];
}

export interface DashboardChartData {
  presence: { date: string; presents: number; absents: number; total: number }[];
  retards: { date: string; retards: number; moyenneRetard: number }[];
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  return serverGet<AdminDashboardStats>("/dashboard/admin/stats");
}

export async function adminGetDashboardChartData(fromIso: string, toIso: string): Promise<DashboardChartData> {
  return serverGet<DashboardChartData>(
    `/dashboard/admin/chart?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
  );
}
