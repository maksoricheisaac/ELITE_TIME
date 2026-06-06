"use server";


import { serverGet, serverPost } from "@/lib/server-api";

export async function getEmployeeAbsences(userId: string) {
  return serverGet(`/absences?userId=${userId}`);
}

export async function requestEmployeeAbsence(params: {
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
}) {
  await serverPost("/absences", params);
}
