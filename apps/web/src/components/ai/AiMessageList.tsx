"use client";

import { useEffect, useRef, memo } from "react";
import { AiMessage } from "./AiMessage";
import { AiTypingIndicator } from "./AiTypingIndicator";
import { AiSuggestions } from "./AiSuggestions";
import type { AiMessage as AiMessageType } from "@/hooks/use-ai-chat";

interface AiMessageListProps {
  messages: AiMessageType[];
  isLoading: boolean;
  isStreaming: boolean;
  onSuggestion: (text: string) => void;
}

export const AiMessageList = memo(function AiMessageList({
  messages,
  isLoading,
  isStreaming,
  onSuggestion,
}: AiMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll vers le bas quand nouveaux messages ou loading
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Scroll uniquement si l'utilisateur est proche du bas (< 100px)
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom || isLoading || isStreaming) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isLoading, isStreaming]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <AiSuggestions onSelect={onSuggestion} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
      role="log"
      aria-label="Conversation avec l'assistant IA"
      aria-live="polite"
      aria-atomic="false"
    >
      {messages.map((message) => (
        <AiMessage key={message.id} message={message} />
      ))}

      {isLoading && <AiTypingIndicator />}

      {/* Ancre pour l'auto-scroll */}
      <div ref={bottomRef} className="h-0 shrink-0" aria-hidden="true" />
    </div>
  );
});
