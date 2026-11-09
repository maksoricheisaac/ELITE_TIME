"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE_NAME = "elitetime_session";

function getApiUrl(): string {
  return process.env.API_URL || "http://127.0.0.1:4000";
}

export async function serverFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };

  if (sessionCookie) {
    headers["Cookie"] = `${SESSION_COOKIE_NAME}=${sessionCookie.value}`;
  }

  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}${path}`, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    // Backend inaccessible — on redirige vers login
    console.error(`[server-api] Backend inaccessible (${path}):`, networkErr);
    redirect("/login");
  }

  // Session expirée ou invalide
  if (res.status === 401) {
    redirect("/login");
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null as T;
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    // Pour les requêtes GET, on retourne null plutôt que de planter la page
    if (options?.method === "GET" || !options?.method) {
      console.warn(
        `[server-api] GET ${path} → ${res.status}: ${json?.message ?? json?.error ?? "error"}`,
      );
      return null as T;
    }
    throw new Error(
      json?.message || json?.error || `API Error ${res.status}: ${path}`,
    );
  }

  return json as T;
}

export async function serverGet<T = unknown>(path: string): Promise<T> {
  return serverFetch<T>(path, { method: "GET" });
}

export async function serverPost<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  return serverFetch<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function serverPatch<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  return serverFetch<T>(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function serverDelete<T = unknown>(path: string): Promise<T> {
  return serverFetch<T>(path, { method: "DELETE" });
}
