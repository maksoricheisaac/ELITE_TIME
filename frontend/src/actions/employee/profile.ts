"use server";

import { serverGet, serverPatch } from "@/lib/server-api";
import type { User } from "@/types/models";

export async function getEmployeeProfile(userId: string): Promise<User> {
  return serverGet<User>(`/users/${userId}`);
}

export async function updateEmployeeProfile(
  userId: string,
  data: { firstname?: string; lastname?: string },
): Promise<User> {
  return serverPatch<User>("/users/me/profile", data);
}

export async function updateEmployeeProfileAction(formData: FormData): Promise<void> {
  await serverPatch("/users/me/profile", {
    firstname: formData.get("firstname") as string,
    lastname: formData.get("lastname") as string,
  });
}

export async function changeLocalPasswordAction(formData: FormData): Promise<void> {
  await serverPatch("/users/me/password", {
    oldPassword: formData.get("oldPassword") as string,
    newPassword: formData.get("newPassword") as string,
  });
}
