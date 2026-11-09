import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://127.0.0.1:4000";
const SESSION_COOKIE_NAME = "elitetime_session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const nestRes = await fetch(`${API_URL}/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie.value}` },
    });

    const data = await nestRes.json();
    return NextResponse.json(data, { status: nestRes.status });
  } catch (error) {
    console.error("[api/me] erreur proxy:", error);
    return NextResponse.json(
      { error: "Service temporairement indisponible" },
      { status: 503 },
    );
  }
}
