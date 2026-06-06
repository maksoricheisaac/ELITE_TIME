import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://127.0.0.1:4000";
const SESSION_COOKIE = "elitetime_session";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const c = cookieStore.get(SESSION_COOKIE);

  if (!c) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const res = await fetch(`${API_URL}/admin/seed/first-admin`, {
    method: "POST",
    headers: { Cookie: `${SESSION_COOKIE}=${c.value}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
