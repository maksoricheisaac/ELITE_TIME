"use server";

import type { ActivityType, User } from "@/types/models";
import { serverGet } from "@/lib/server-api";

type LogEntry = {
  id: string;
  userId: string | null;
  action: string;
  details: string;
  timestamp: Date;
  type: ActivityType;
  user: User | null;
};

export type LogsPageData = {
  logs: LogEntry[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
};

export async function adminGetActivityLogs(options?: {
  page?: number;
  limit?: number;
  type?: string;
  userId?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  if (options?.page) qs.set("page", String(options.page));
  if (options?.limit) qs.set("limit", String(options.limit));
  if (options?.type) qs.set("type", options.type);
  if (options?.userId) qs.set("userId", options.userId);
  if (options?.from) qs.set("from", options.from);
  if (options?.to) qs.set("to", options.to);
  return serverGet<LogsPageData>(`/logs?${qs.toString()}`);
}

export async function adminGetActivityLogsWithEmployees(options?: {
  page?: number;
  limit?: number;
  type?: string;
  userId?: string;
  from?: string;
  to?: string;
}) {
  const [logs, employees] = await Promise.all([
    adminGetActivityLogs(options),
    serverGet<User[]>("/logs/employees"),
  ]);
  return { logs, employees };
}

export async function createActivityLog(
  _userId: string,
  _action: string,
  _details: string,
  _type: string,
) {
  // Les logs sont maintenant créés côté NestJS.
  // Cette fonction reste pour compatibilité mais ne fait rien côté frontend.
  // Les services NestJS créent les logs directement.
}
