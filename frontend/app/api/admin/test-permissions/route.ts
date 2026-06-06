import { NextResponse } from "next/server";

// Route de test — retirer en production
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ message: "Test permissions endpoint migrated to NestJS." });
}
