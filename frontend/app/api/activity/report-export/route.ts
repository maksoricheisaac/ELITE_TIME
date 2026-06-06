import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/security/rbac";
import { createActivityLog } from "@/actions/admin/logs";

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedUser();
    const body = await req.json().catch(() => ({}));
    const { reportType, details } = body as { reportType?: string; details?: string };

    if (!reportType || typeof reportType !== "string") {
      return NextResponse.json(
        { error: "Type de rapport invalide" },
        { status: 400 },
      );
    }

    const detailsText = details && typeof details === "string" ? details : "";

    await createActivityLog(
      auth.user.id,
      "Export de rapport",
      `type=${reportType}${detailsText ? ` – ${detailsText}` : ""}`,
      "user",
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur lors du logging d'export de rapport:", error);
    return NextResponse.json(
      { error: "Erreur lors du logging d'export de rapport" },
      { status: 500 },
    );
  }
}
