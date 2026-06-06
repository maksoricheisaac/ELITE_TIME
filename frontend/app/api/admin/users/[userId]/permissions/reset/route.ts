import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://127.0.0.1:4000";
const SESSION_COOKIE = "elitetime_session";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const cookieStore = await cookies();
  const c = cookieStore.get(SESSION_COOKIE);

  const res = await fetch(`${API_URL}/permissions/user/${userId}/reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(c ? { Cookie: `${SESSION_COOKIE}=${c.value}` } : {}),
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
