"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  streamAiMessage,
  sendAiMessage,
  AiRateLimitError,
  AiUnavailableError,
  AiAuthError,
  type AiHistoryEntry,
  type SseDoneEvent,
  type SseToolCallEvent,
} from "@/lib/ai-client";

// ─── Types publics ────────────────────────────────────────────────────────────

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolsUsed?: string[];
  toolLabels?: string[];
  isError?: boolean;
  isStreaming?: boolean;
}

export interface UseAiChatReturn {
  messages: AiMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearHistory: () => void;
  cancelRequest: () => void;
  retryLast: () => Promise<void>;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "elitetime_ai_chat";
const MAX_STORED_MESSAGES = 50;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_INPUT_LENGTH = 800;
const MAX_HISTORY_FOR_API = 10;

/** Utiliser le streaming SSE en priorité */
const USE_STREAMING = true;

// ─── Helpers persistance ──────────────────────────────────────────────────────

interface PersistedEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolsUsed?: string[];
  toolLabels?: string[];
  isError?: boolean;
}

interface PersistedState {
  entries: PersistedEntry[];
  lastUpdated: number;
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeInput(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .slice(0, MAX_INPUT_LENGTH)
    .trim();
}

function loadFromStorage(): AiMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: PersistedState = JSON.parse(raw) as PersistedState;
    if (Date.now() - data.lastUpdated > HISTORY_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return data.entries.map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));
  } catch {
    return [];
  }
}

function saveToStorage(messages: AiMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const slice = messages
      .filter((m) => !m.isStreaming)
      .slice(-MAX_STORED_MESSAGES);
    const data: PersistedState = {
      entries: slice.map((m) => ({
        ...m,
        isStreaming: undefined,
        timestamp: m.timestamp.toISOString(),
      })),
      lastUpdated: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage plein ou indisponible
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAiChat(): UseAiChatReturn {
  const [messages, setMessages] = useState<AiMessage[]>(() =>
    loadFromStorage(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserInputRef = useRef<string>("");

  useEffect(() => {
    saveToStorage(messages);
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessageStreaming = async (
    text: string,
    history: AiHistoryEntry[],
    signal: AbortSignal,
  ) => {
    const assistantMsgId = generateId();
    const toolsUsed: string[] = [];
    const toolLabels: string[] = [];
    let accumulatedContent = "";
    let streamingStarted = false;

    // N'ajouter le message qu'au premier token — l'indicateur de frappe reste
    // visible pendant toute la phase de traitement (tool calls, synthèse LLM).
    const startStreaming = () => {
      if (streamingStarted) return;
      streamingStarted = true;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isStreaming: true,
          toolsUsed: toolsUsed.length > 0 ? [...toolsUsed] : undefined,
          toolLabels: toolLabels.length > 0 ? [...toolLabels] : undefined,
        } satisfies AiMessage,
      ]);
      setIsStreaming(true);
    };

    try {
      const generator = streamAiMessage({ message: text, history }, signal);

      for await (const event of generator) {
        if (signal.aborted) break;

        if (event.type === "token") {
          startStreaming();
          accumulatedContent += event.content;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: accumulatedContent }
                : m,
            ),
          );
        } else if (event.type === "tool_call") {
          const e = event as SseToolCallEvent;
          if (!toolsUsed.includes(e.name)) {
            toolsUsed.push(e.name);
            if (e.label) toolLabels.push(e.label);
          }
          // tool_call arrive avant les tokens — on accumule sans créer le message
        } else if (event.type === "done") {
          startStreaming();
          const e = event as SseDoneEvent;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    toolsUsed: e.toolsUsed,
                    toolLabels,
                  }
                : m,
            ),
          );
          break;
        } else if (event.type === "error") {
          const errorText = (event as { message: string }).message;
          if (streamingStarted) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: errorText, isStreaming: false, isError: true }
                  : m,
              ),
            );
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: assistantMsgId,
                role: "assistant",
                content: errorText,
                timestamp: new Date(),
                isError: true,
              },
            ]);
          }
          setError(errorText);
          break;
        }
      }

      // Finaliser si non complété par 'done'
      if (streamingStarted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId && m.isStreaming
              ? {
                  ...m,
                  isStreaming: false,
                  content:
                    m.content ||
                    "Je ne dispose pas des informations nécessaires pour répondre.",
                }
              : m,
          ),
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (streamingStarted) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
            ),
          );
        }
        return;
      }

      const errorText =
        err instanceof AiRateLimitError ||
        err instanceof AiUnavailableError ||
        err instanceof AiAuthError
          ? err.message
          : "Une erreur est survenue. Veuillez réessayer.";

      if (streamingStarted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: errorText, isStreaming: false, isError: true }
              : m,
          ),
        );
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant",
            content: errorText,
            timestamp: new Date(),
            isError: true,
          },
        ]);
      }
      setError(errorText);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const sendMessageClassic = async (
    text: string,
    history: AiHistoryEntry[],
    signal: AbortSignal,
  ) => {
    try {
      const response = await sendAiMessage({ message: text, history }, signal);

      const assistantMsg: AiMessage = {
        id: generateId(),
        role: "assistant",
        content: response.message,
        timestamp: new Date(),
        toolsUsed: response.toolsUsed?.filter(Boolean),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;

      const errorText =
        err instanceof AiRateLimitError ||
        err instanceof AiUnavailableError ||
        err instanceof AiAuthError
          ? err.message
          : "Une erreur est survenue. Veuillez réessayer.";

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: errorText,
          timestamp: new Date(),
          isError: true,
        },
      ]);
      setError(errorText);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = sanitizeInput(rawText);
      if (!text || isLoading) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      lastUserInputRef.current = text;

      const userMsg: AiMessage = {
        id: generateId(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setError(null);

      const history: AiHistoryEntry[] = messages
        .filter((m) => !m.isError && !m.isStreaming)
        .slice(-MAX_HISTORY_FOR_API)
        .map((m) => ({ role: m.role, content: m.content }));

      if (USE_STREAMING) {
        await sendMessageStreaming(text, history, abortRef.current.signal);
      } else {
        await sendMessageClassic(text, history, abortRef.current.signal);
      }
    },
    [messages, isLoading],
  );

  const retryLast = useCallback(async () => {
    if (!lastUserInputRef.current || isLoading) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return last?.isError ? prev.slice(0, -1) : prev;
    });
    await sendMessage(lastUserInputRef.current);
  }, [sendMessage, isLoading]);

  const cancelRequest = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setIsStreaming(false);
    // Finaliser le message en cours de streaming
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m,
      ),
    );
  }, []);

  const clearHistory = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setIsStreaming(false);
    lastUserInputRef.current = "";
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    clearHistory,
    cancelRequest,
    retryLast,
  };
}
