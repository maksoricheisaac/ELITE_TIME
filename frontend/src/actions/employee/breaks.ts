"use server";

import { serverGet, serverPost } from "@/lib/server-api";
import type { Break } from "@/types/models";

export async function startEmployeeBreak(_userId: string) {
  return serverPost<Break>("/breaks/start");
}

export async function endEmployeeBreak(_userId: string) {
  return serverPost<Break>("/breaks/end");
}

export async function getEmployeeTodayBreaks(userId: string) {
  return serverGet<Break[]>(`/breaks/today?userId=${userId}`);
}
