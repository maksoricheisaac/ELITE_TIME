import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://127.0.0.1:4000";
const SESSION_COOKIE = "elitetime_session";

async function getHeaders() {
  const cookieStore = await cookies();
  const c = cookieStore.get(SESSION_COOKIE);
  return {
    "Content-Type": "application/json",
    ...(c ? { Cookie: `${SESSION_COOKIE}=${c.value}` } : {}),
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const body = await req.json();
  const res = await fetch(`${API_URL}/permissions/user/${userId}`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const url = new URL(req.url);
  const permissionId =
    url.searchParams.get("permissionId") ||
    (await req.json().catch(() => ({}))).permissionId;

  const res = await fetch(
    `${API_URL}/permissions/user/${userId}/${permissionId}`,
    { method: "DELETE", headers: await getHeaders() },
  );
  const data = await res.json().catch(() => ({ success: true }));
  return NextResponse.json(data, { status: res.status });
}
