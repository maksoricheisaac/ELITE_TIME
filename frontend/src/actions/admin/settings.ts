"use server";

import { serverGet, serverPatch } from "@/lib/server-api";
import type { SystemSettings } from "@/types/models";

export async function getSystemSettings(): Promise<SystemSettings> {
  return serverGet<SystemSettings>("/settings");
}

export async function adminGetSystemSettings(): Promise<SystemSettings> {
  return serverGet<SystemSettings>("/settings");
}

export async function adminUpdateSystemSettings(data: Record<string, unknown>) {
  await serverPatch("/settings", data);
}
