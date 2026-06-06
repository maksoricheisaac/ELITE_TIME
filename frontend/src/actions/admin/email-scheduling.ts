"use server";

import { serverGet, serverPost } from "@/lib/server-api";

type ScheduleJob = {
  id: string;
  enabled: boolean;
  hour: number;
  minute: number;
  includePdf: boolean;
  includeExcel: boolean;
  includeCsv: boolean;
  recipientUserIds: string[];
  recipientEmails: string[];
};

export type EmailSchedulingData = {
  eligibleUsers: Array<{
    id: string;
    username: string;
    email: string | null;
    firstname: string | null;
    lastname: string | null;
    role: string;
  }>;
  dailyReportMode: "TODAY" | "YESTERDAY";
  timezone: string;
  daily: ScheduleJob | null;
  weekly: (ScheduleJob & { weekday: number; weekStartDay: number }) | null;
  monthly: (ScheduleJob & { monthlySendDay: number }) | null;
};

export async function adminGetEmailScheduling() {
  return serverGet<EmailSchedulingData>("/email-scheduling");
}

type SingleJobInput = {
  type: "DAILY_REPORT" | "WEEKLY_REPORT" | "MONTHLY_REPORT";
  enabled: boolean;
  hour: number;
  minute: number;
  weekday?: number;
  weekStartDay?: number;
  monthlySendDay?: number;
  includePdf?: boolean;
  includeExcel?: boolean;
  includeCsv?: boolean;
  recipientUserIds?: string[];
  recipientEmails?: string[];
};

type MultiJobInput = {
  daily?: Partial<SingleJobInput>;
  weekly?: Partial<SingleJobInput>;
  monthly?: Partial<SingleJobInput>;
};

export async function adminUpdateEmailScheduling(input: SingleJobInput | MultiJobInput) {
  // Handle both single job and multi-job formats
  if ('type' in input) {
    await serverPost("/email-scheduling", input);
  } else {
    // Multi-job format: send each job individually
    const jobs = [];
    if ((input as MultiJobInput).daily) jobs.push({ type: "DAILY_REPORT", ...(input as MultiJobInput).daily });
    if ((input as MultiJobInput).weekly) jobs.push({ type: "WEEKLY_REPORT", ...(input as MultiJobInput).weekly });
    if ((input as MultiJobInput).monthly) jobs.push({ type: "MONTHLY_REPORT", ...(input as MultiJobInput).monthly });
    for (const job of jobs) {
      await serverPost("/email-scheduling", job);
    }
  }
}
