"use server";

import { serverPatch, serverPost, serverDelete } from "@/lib/server-api";

export async function approveAbsence(absenceId: string) {
  await serverPatch(`/absences/${absenceId}/approve`);
}

export async function rejectAbsence(absenceId: string, comment?: string) {
  await serverPatch(`/absences/${absenceId}/reject`, { comment });
}

function toDateStr(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export async function createManagedLeave(params: {
  userId: string;
  type?: string;
  startDate: Date | string;
  endDate: Date | string;
  reason: string;
}) {
  await serverPost("/absences/managed", {
    ...params,
    startDate: toDateStr(params.startDate),
    endDate: toDateStr(params.endDate),
  });
}

export async function updateManagedLeave(params: {
  id: string;
  startDate?: Date | string;
  endDate?: Date | string;
  reason?: string;
}) {
  const { id, ...data } = params;
  await serverPatch(`/absences/managed/${id}`, {
    ...data,
    startDate: toDateStr(data.startDate),
    endDate: toDateStr(data.endDate),
  });
}

export async function deleteManagedLeave(absenceId: string) {
  await serverDelete(`/absences/managed/${absenceId}`);
}
