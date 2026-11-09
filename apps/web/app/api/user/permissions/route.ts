import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://127.0.0.1:4000";
const SESSION_COOKIE_NAME = "elitetime_session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie) {
      return NextResponse.json({ permissions: [] }, { status: 401 });
    }

    const nestRes = await fetch(`${API_URL}/auth/permissions`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie.value}` },
    });

    const data = await nestRes.json();
    return NextResponse.json(data, { status: nestRes.status });
  } catch {
    return NextResponse.json({ permissions: [] }, { status: 503 });
  }
}
