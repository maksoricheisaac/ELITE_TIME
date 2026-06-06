"use server";


import { serverGet, serverPost, serverPatch, serverDelete } from "@/lib/server-api";

export async function createDepartment(formData: FormData) {
  await serverPost("/departments", {
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || undefined,
  });
}

export async function updateDepartment(formData: FormData) {
  const id = formData.get("id") as string;
  await serverPatch(`/departments/${id}`, {
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || undefined,
  });
}

export async function deleteDepartment(formData: FormData) {
  const id = formData.get("id") as string;
  await serverDelete(`/departments/${id}`);
}

export async function getDepartments() {
  return serverGet("/departments");
}
