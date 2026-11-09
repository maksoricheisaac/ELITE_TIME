"use server";


import { serverGet, serverPost, serverPatch, serverDelete } from "@/lib/server-api";

export async function getPositionsByDepartment(departmentId: string) {
  return serverGet(`/positions?departmentId=${departmentId}`);
}

export async function getAllPositions() {
  return serverGet("/positions");
}

export async function createPosition(
  name: string,
  departmentId: string,
  description?: string,
) {
  await serverPost("/positions", { name, departmentId, description });
}

export async function updatePosition(
  positionId: string,
  name: string,
  departmentId: string,
  description?: string,
) {
  await serverPatch(`/positions/${positionId}`, {
    name,
    departmentId,
    description,
  });
}

export async function deletePosition(positionId: string) {
  await serverDelete(`/positions/${positionId}`);
}

export async function createPositionFromForm(formData: FormData) {
  return createPosition(
    formData.get("name") as string,
    formData.get("departmentId") as string,
    formData.get("description") as string | undefined,
  );
}

export async function updatePositionFromForm(formData: FormData) {
  return updatePosition(
    formData.get("id") as string,
    formData.get("name") as string,
    formData.get("departmentId") as string,
    formData.get("description") as string | undefined,
  );
}

export async function deletePositionFromForm(formData: FormData) {
  return deletePosition(formData.get("id") as string);
}
