import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ message: "Test permissions-full endpoint migrated to NestJS." });
}
