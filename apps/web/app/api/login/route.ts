import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://127.0.0.1:4000";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const nestRes = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await nestRes.json();
    const response = NextResponse.json(data, { status: nestRes.status });

    // Transférer le cookie de session posé par NestJS
    const setCookie = nestRes.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }

    return response;
  } catch (error) {
    console.error("[api/login] erreur proxy:", error);
    return NextResponse.json(
      { error: "Service temporairement indisponible" },
      { status: 503 },
    );
  }
}
