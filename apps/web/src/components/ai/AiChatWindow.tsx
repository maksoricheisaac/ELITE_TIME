"use client";

import { useCallback } from "react";
import { Minus, Trash2, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { AiMessageList } from "./AiMessageList";
import { AiInput } from "./AiInput";
import { useAiChat } from "@/hooks/use-ai-chat";
import { cn } from "@/lib/utils";

interface AiChatWindowProps {
  onClose: () => void;
  onMinimize: () => void;
}

export function AiChatWindow({ onClose, onMinimize }: AiChatWindowProps) {
  const { messages, isLoading, isStreaming, sendMessage, clearHistory, cancelRequest, retryLast } =
    useAiChat();

  const hasMessages = messages.length > 0;
  const hasError = messages.some((m) => m.isError);
  const isActive = isLoading || isStreaming;

  const handleSuggestion = useCallback(
    (text: string) => {
      void sendMessage(text);
    },
    [sendMessage],
  );

  const handleSend = useCallback(
    (text: string) => {
      void sendMessage(text);
    },
    [sendMessage],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        // Desktop : panneau flottant
        "fixed bottom-[4.5rem] right-4 z-50 flex w-[22rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/20",
        // Mobile : plein écran
        "max-sm:bottom-0 max-sm:right-0 max-sm:h-[100dvh] max-sm:w-full max-sm:rounded-none max-sm:border-0",
        // Hauteur desktop
        "sm:h-[32rem]",
      )}
      role="dialog"
      aria-label="Assistant IA EliteTime"
      aria-modal="true"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-[var(--primary)] px-3.5 py-2.5 text-white">
        <div className="flex items-center gap-2.5">
          {/* Icône IA */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20">
            <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
              <path
                d="M8 1.5a2 2 0 0 1 2 2v.5h1A1.5 1.5 0 0 1 12.5 5.5v7A1.5 1.5 0 0 1 11 14H5a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 5 4h1V3.5a2 2 0 0 1 2-2ZM6.5 4h3V3.5a1.5 1.5 0 0 0-3 0V4ZM5 5a.5.5 0 0 0-.5.5V6h7V5.5A.5.5 0 0 0 11 5H5Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-tight">EliteTime IA</p>
            <p className="text-[10px] text-white/70 leading-tight">
              {isStreaming ? "Réponse en cours…" : isActive ? "Analyse en cours…" : "Assistant RH"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Effacer historique */}
          {hasMessages && (
            <button
              type="button"
              onClick={clearHistory}
              className="flex h-6 w-6 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/20 hover:text-white"
              aria-label="Effacer la conversation"
              title="Effacer la conversation"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          {/* Réessayer */}
          {hasError && !isLoading && (
            <button
              type="button"
              onClick={() => void retryLast()}
              className="flex h-6 w-6 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/20 hover:text-white"
              aria-label="Réessayer"
              title="Réessayer"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
          {/* Réduire */}
          <button
            type="button"
            onClick={onMinimize}
            className="flex h-6 w-6 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Réduire"
            title="Réduire"
          >
            <Minus className="size-3.5" />
          </button>
          {/* Fermer */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Fermer l'assistant"
            title="Fermer"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Messages ───────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AiMessageList
          messages={messages}
          isLoading={isLoading && !isStreaming}
          isStreaming={isStreaming}
          onSuggestion={handleSuggestion}
        />
      </div>

      {/* ── Input ──────────────────────────────────────────────────────── */}
      <AiInput
        onSend={handleSend}
        onCancel={cancelRequest}
        isLoading={isActive}
        disabled={false}
      />
    </motion.div>
  );
}
