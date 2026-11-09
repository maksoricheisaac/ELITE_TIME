"use server";

import { serverGet } from "@/lib/server-api";

export async function managerGetDashboardStats(_managerId: string) {
  return serverGet("/dashboard/manager/stats");
}

export async function managerGetDashboardChartData(
  managerId: string,
  fromIso: string,
  toIso: string,
) {
  return serverGet(
    `/dashboard/manager/chart?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
  );
}
