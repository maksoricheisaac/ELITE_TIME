import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://127.0.0.1:4000";
const SESSION_COOKIE_NAME = "elitetime_session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: sessionCookie
        ? { Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie.value}` }
        : {},
    });

    const response = NextResponse.json({ success: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (error) {
    console.error("[api/logout] erreur proxy:", error);
    const response = NextResponse.json({ success: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }
}
