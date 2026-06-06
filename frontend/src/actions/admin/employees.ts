"use server";


import { serverPatch, serverPost, serverDelete } from "@/lib/server-api";

export async function updateEmployee(formData: FormData) {
  const id = formData.get("id") as string;
  await serverPatch(`/users/${id}`, {
    firstname: formData.get("firstname") || undefined,
    lastname: formData.get("lastname") || undefined,
    email: formData.get("email") || undefined,
    role: formData.get("role") || undefined,
    department: formData.get("department") || undefined,
    position: formData.get("position") || undefined,
    status: formData.get("status") || undefined,
    teamLeadId: formData.get("teamLeadId") || undefined,
  });
}

export async function syncEmployeesFromLdap() {
  await serverPost("/ldap/sync");
}

export async function adminSoftDeleteEmployee(userId: string) {
  await serverDelete(`/users/${userId}`);
}

export async function toggleEmployeeIncludeInReports(
  userId: string,
  include: boolean,
) {
  await serverPatch(`/users/${userId}/include-in-reports`, {
    include,
  });
}
