"use server";

import { serverGet, serverPost, serverPatch, serverDelete } from "@/lib/server-api";
import type { User } from "@/types/models";

export async function adminGetAllUsers(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  status?: string;
}): Promise<{ users: User[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("limit", String(params.pageSize));
  if (params?.search) qs.set("search", params.search);
  if (params?.role) qs.set("role", params.role);
  if (params?.status) qs.set("status", params.status);
  return serverGet<{ users: User[]; total: number }>(`/users?${qs.toString()}`);
}

export async function adminCreateUser(input: {
  username: string;
  email?: string;
  firstname?: string | null;
  lastname?: string | null;
  password?: string;
  role?: string;
  department?: string | null;
  position?: string | null;
  isLocal?: boolean;
  status?: string;
  includeInReports?: boolean;
  hiddenFromLists?: boolean;
}): Promise<User> {
  return serverPost<User>("/users", input);
}

export async function adminUpdateUser(
  userId: string,
  data: Partial<{
    email: string | null;
    firstname: string | null;
    lastname: string | null;
    role: string;
    status: string;
    department: string | null;
    position: string | null;
    hiddenFromLists: boolean;
    includeInReports: boolean;
    teamLeadId: string | null;
  }>,
): Promise<User> {
  return serverPatch<User>(`/users/${userId}`, data);
}

export async function adminDeleteUser(userId: string) {
  await serverDelete(`/users/${userId}`);
}
