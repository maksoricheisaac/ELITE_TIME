import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://127.0.0.1:4000";
const SESSION_COOKIE = "elitetime_session";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const c = cookieStore.get(SESSION_COOKIE);
  const res = await fetch(`${API_URL}/admin/seed/grant-all`, {
    method: "POST",
    headers: c ? { Cookie: `${SESSION_COOKIE}=${c.value}` } : {},
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
