"use server";

import { serverGet } from "@/lib/server-api";

export async function managerGetTeamData(_managerId: string) {
  return serverGet(`/users?role=employee&status=active`);
}
