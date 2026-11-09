"use server";

import { serverGet, serverPost, serverDelete } from "@/lib/server-api";
import type { Absence } from "@/types/models";

export async function getEmployeeAbsences(userId: string) {
  return serverGet<Absence[]>(`/absences?userId=${userId}`);
}

export async function requestEmployeeAbsence(params: {
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
}) {
  await serverPost("/absences", params);
}

export async function cancelOwnAbsence(id: string) {
  await serverDelete(`/absences/${id}`);
}
