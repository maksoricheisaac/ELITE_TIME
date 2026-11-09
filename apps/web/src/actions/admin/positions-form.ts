"use server";

import { revalidatePath } from "next/cache";
import { serverPost, serverPatch, serverDelete } from "@/lib/server-api";

export async function createPositionFromForm(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || undefined;
  const departmentId = (formData.get("departmentId") as string | null)?.trim();

  if (!name || !departmentId) return;

  await serverPost("/positions", { name, description, departmentId });
  revalidatePath("/postes");
}

export async function updatePositionFromForm(formData: FormData) {
  const id = (formData.get("id") as string | null)?.trim();
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || undefined;
  const departmentId = (formData.get("departmentId") as string | null)?.trim();

  if (!id || !name || !departmentId) return;

  await serverPatch(`/positions/${id}`, { name, description, departmentId });
  revalidatePath("/postes");
}

export async function deletePositionFromForm(formData: FormData) {
  const id = (formData.get("id") as string | null)?.trim();
  if (!id) return;

  await serverDelete(`/positions/${id}`);
  revalidatePath("/postes");
}
