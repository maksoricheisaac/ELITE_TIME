import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://127.0.0.1:4000";
const SESSION_COOKIE = "elitetime_session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const c = cookieStore.get(SESSION_COOKIE);
  const { searchParams } = req.nextUrl;

  const qs = new URLSearchParams();
  if (searchParams.get("month")) {
    const month = searchParams.get("month")!;
    const year = searchParams.get("year") || String(new Date().getFullYear());
    const from = `${year}-${month.padStart(2, "0")}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const to = `${year}-${month.padStart(2, "0")}-${lastDay}`;
    qs.set("from", from);
    qs.set("to", to);
  } else {
    if (searchParams.get("from")) qs.set("from", searchParams.get("from")!);
    if (searchParams.get("to")) qs.set("to", searchParams.get("to")!);
  }

  const res = await fetch(`${API_URL}/reports/excel?${qs.toString()}`, {
    headers: c ? { Cookie: `${SESSION_COOKIE}=${c.value}` } : {},
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur génération rapport" }));
    return NextResponse.json(err, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rapport_mensuel.xlsx"`,
    },
  });
}
