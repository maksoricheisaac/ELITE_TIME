"use server";

import { serverGet, serverPost, serverDelete } from "@/lib/server-api";
import type { Pointage } from "@/types/models";

export async function managerGetManualPointagesByDate(dateStr: string, userIds: string[]): Promise<Pointage[]> {
  return serverGet<Pointage[]>(
    `/pointages/manager/by-date?date=${dateStr}&userIds=${userIds.join(",")}`,
  );
}

export async function managerGetManualPointagesByDateWithSessions(
  dateStr: string,
  userIds: string[],
): Promise<Pointage[]> {
  return managerGetManualPointagesByDate(dateStr, userIds);
}

export async function upsertManualPointage(
  managerId: string,
  userId: string,
  date: string,
  entryTime: string | null,
  exitTime: string | null,
  lateReason: string | null,
  earlyExitReason: string | null,
  sessionNumber = 1,
): Promise<Pointage> {
  return serverPost<Pointage>("/pointages/manager", {
    userId, date, entryTime, exitTime, lateReason, earlyExitReason, sessionNumber,
  });
}

export async function submitManualPointage(formData: FormData): Promise<void> {
  await upsertManualPointage(
    formData.get("managerId") as string,
    formData.get("userId") as string,
    formData.get("date") as string,
    formData.get("entryTime") as string | null,
    formData.get("exitTime") as string | null,
    formData.get("lateReason") as string | null,
    formData.get("earlyExitReason") as string | null,
    Number(formData.get("sessionNumber") || 1),
  );
}

export async function managerGetPointagesData(managerId: string) {
  return serverGet(`/reports/team?userId=${managerId}&days=30`);
}

export async function deleteExtraPointageSessions(managerId: string, userId: string, dateStr: string): Promise<void> {
  await serverDelete(`/pointages/manager/extra-sessions?userId=${userId}&date=${dateStr}`);
}
