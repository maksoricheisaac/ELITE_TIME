"use server";

import { serverGet, serverPost, serverPatch } from "@/lib/server-api";
import type { Pointage } from "@/types/models";

export async function getEmployeeRecentPointages(userId: string, fromDate: Date, toDate: Date) {
  return serverGet<Pointage[]>(
    `/pointages?userId=${userId}&from=${fromDate.toISOString()}&to=${toDate.toISOString()}`,
  );
}

export async function getEmployeeWeekStats(userId: string) {
  return serverGet<{ hours: number; lates: number; overtime: number }>(`/pointages/week-stats?userId=${userId}`);
}

export async function getEmployeeTodayPointage(userId: string) {
  return serverGet<Pointage | null>(`/pointages/today?userId=${userId}`);
}

export async function startEmployeePointage(userId: string, earlyExitReason?: string) {
  return serverPost<Pointage>("/pointages/start", { earlyExitReason });
}

export async function endEmployeePointage(userId: string, earlyExitReason?: string) {
  return serverPost<{ pointage: Pointage; isEarlyExit: boolean; earlyExitMinutes?: number }>(
    "/pointages/end",
    { earlyExitReason },
  );
}

export async function updateEmployeeLateReason(userId: string, reason: string) {
  return serverPatch<Pointage>("/pointages/today/late-reason", { reason });
}

export async function getEmployeeTodayPointages(userId: string) {
  return serverGet<Pointage[]>(`/pointages/today/all?userId=${userId}`);
}

export async function updateEmployeeEarlyExitReason(userId: string, pointageId: string, reason: string) {
  return serverPatch<Pointage>(`/pointages/${pointageId}/early-exit-reason`, { reason });
}

export async function updateEmployeeLateReasonById(userId: string, pointageId: string, reason: string) {
  return serverPatch<Pointage>(`/pointages/${pointageId}/late-reason`, { reason });
}

export async function getEmployeeIncompletePointages(userId: string) {
  return serverGet<Pointage[]>(`/pointages/incomplete?userId=${userId}`);
}
