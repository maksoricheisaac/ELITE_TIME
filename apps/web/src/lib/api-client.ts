// Client-side API client — browser fetch avec credentials (cookies automatiques)

function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
}

async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string> | undefined),
    },
  });

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null as T;
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(
      json?.message || json?.error || `API Error ${res.status}: ${path}`,
    );
  }

  return json as T;
}

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path, { method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T = unknown>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

export default api;
