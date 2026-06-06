// Client API pour l'assistant IA EliteTime
// Supporte requêtes classiques + streaming SSE

const AI_CHAT_ENDPOINT = "/ai/chat";
const AI_STREAM_ENDPOINT = "/ai/chat/stream";
const AI_HEALTH_ENDPOINT = "/ai/health";

function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  message: string;
  history?: AiHistoryEntry[];
}

export interface AiChatResponse {
  message: string;
  toolsUsed?: string[];
}

export interface AiHealthResponse {
  status: "ok" | "degraded";
  ollama: boolean;
  model: string;
  modelDisplayName?: string;
  circuit?: { state: string; failures: number };
}

// ─── Types SSE ────────────────────────────────────────────────────────────────

export type SseEventType = "token" | "tool_call" | "done" | "error";

export interface SseTokenEvent {
  type: "token";
  content: string;
}

export interface SseToolCallEvent {
  type: "tool_call";
  name: string;
  label?: string;
}

export interface SseDoneEvent {
  type: "done";
  toolsUsed: string[];
}

export interface SseErrorEvent {
  type: "error";
  message: string;
}

export type SseEvent =
  | SseTokenEvent
  | SseToolCallEvent
  | SseDoneEvent
  | SseErrorEvent;

// ─── Erreurs typées ───────────────────────────────────────────────────────────

export class AiRateLimitError extends Error {
  readonly status = 429;
  constructor() {
    super("Limite de requêtes atteinte. Veuillez réessayer dans quelques minutes.");
    this.name = "AiRateLimitError";
  }
}

export class AiUnavailableError extends Error {
  readonly status = 503;
  constructor() {
    super("L'assistant IA est temporairement indisponible. Veuillez réessayer.");
    this.name = "AiUnavailableError";
  }
}

export class AiAuthError extends Error {
  readonly status = 401;
  constructor() {
    super("Session expirée. Veuillez vous reconnecter.");
    this.name = "AiAuthError";
  }
}

// ─── Client classique ─────────────────────────────────────────────────────────

export async function sendAiMessage(
  request: AiChatRequest,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  const res = await fetch(`${getApiUrl()}${AI_CHAT_ENDPOINT}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok) {
    if (res.status === 429) throw new AiRateLimitError();
    if (res.status === 503) throw new AiUnavailableError();
    if (res.status === 401) throw new AiAuthError();
    const json = await res.json().catch(() => ({}));
    throw new Error(
      (json as { message?: string })?.message || `Erreur ${res.status}`,
    );
  }

  return res.json() as Promise<AiChatResponse>;
}

// ─── Client streaming SSE ─────────────────────────────────────────────────────

/**
 * Envoie un message en streaming SSE.
 * Yield chaque événement SSE parsé depuis le serveur.
 * Compatible avec fetch ReadableStream (navigateurs modernes).
 */
export async function* streamAiMessage(
  request: AiChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const res = await fetch(`${getApiUrl()}${AI_STREAM_ENDPOINT}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok) {
    if (res.status === 429) throw new AiRateLimitError();
    if (res.status === 503) throw new AiUnavailableError();
    if (res.status === 401) throw new AiAuthError();
    throw new Error(`Erreur ${res.status}`);
  }

  const body = res.body;
  if (!body) throw new Error("Corps de réponse vide");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parser le format SSE : "event: <type>\ndata: <json>\n\n"
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? ""; // Dernier bloc potentiellement incomplet

      for (const block of blocks) {
        const parsed = parseSSEBlock(block);
        if (parsed) yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSSEBlock(block: string): SseEvent | null {
  const lines = block.split("\n").filter((l) => l.trim() && !l.startsWith(":"));
  let eventType = "";
  let dataStr = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataStr = line.slice(6).trim();
    }
  }

  if (!eventType || !dataStr) return null;

  try {
    const data = JSON.parse(dataStr) as Record<string, unknown>;
    return { type: eventType, ...data } as SseEvent;
  } catch {
    return null;
  }
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function checkAiHealth(): Promise<AiHealthResponse> {
  const res = await fetch(`${getApiUrl()}${AI_HEALTH_ENDPOINT}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Health check failed");
  return res.json() as Promise<AiHealthResponse>;
}
