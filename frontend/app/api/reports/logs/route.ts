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
  searchParams.forEach((v, k) => qs.set(k, v));

  const res = await fetch(`${API_URL}/logs?${qs.toString()}`, {
    headers: c ? { Cookie: `${SESSION_COOKIE}=${c.value}` } : {},
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
