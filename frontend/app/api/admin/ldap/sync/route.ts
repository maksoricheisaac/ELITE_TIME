import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://127.0.0.1:4000";
const SESSION_COOKIE = "elitetime_session";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);

  const res = await fetch(`${API_URL}/ldap/sync`, {
    method: "POST",
    headers: sessionCookie
      ? { Cookie: `${SESSION_COOKIE}=${sessionCookie.value}` }
      : {},
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
