"use client";

import {
  useState,
  useRef,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 800;
const SPAM_DELAY_MS = 1000; // délai minimum entre 2 envois

interface AiInputProps {
  onSend: (text: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function AiInput({ onSend, onCancel, isLoading, disabled }: AiInputProps) {
  const [value, setValue] = useState("");
  const lastSentRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 && !disabled;
  const charCount = value.length;
  const isNearLimit = charCount > MAX_LENGTH * 0.85;
  const isAtLimit = charCount >= MAX_LENGTH;

  const handleSubmit = useCallback(() => {
    const text = value.trim();
    if (!text || isLoading || disabled) return;

    // Anti-spam : délai minimum entre 2 envois
    const now = Date.now();
    if (now - lastSentRef.current < SPAM_DELAY_MS) return;
    lastSentRef.current = now;

    onSend(text);
    setValue("");

    // Resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isLoading, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.slice(0, MAX_LENGTH);
    setValue(newValue);

    // Auto-resize textarea
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className="border-t border-border bg-card px-3 py-2.5">
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border bg-background px-3 py-2 transition-colors duration-150",
          "focus-within:border-[var(--primary)]/60 focus-within:ring-2 focus-within:ring-[var(--primary)]/20",
          disabled && "opacity-60",
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Posez votre question RH…"
          disabled={disabled}
          rows={1}
          maxLength={MAX_LENGTH}
          aria-label="Message à l'assistant IA"
          className={cn(
            "max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent text-sm leading-6 text-foreground placeholder:text-muted-foreground/60 focus:outline-none",
          )}
          style={{ height: "24px" }}
        />

        {/* Bouton annuler (visible pendant loading) ou envoyer */}
        {isLoading ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Annuler la requête en cours"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150",
              canSend
                ? "bg-[var(--primary)] text-white shadow-sm hover:brightness-110 active:scale-95"
                : "bg-muted text-muted-foreground/40 cursor-not-allowed",
            )}
            aria-label="Envoyer le message"
          >
            <Send className="size-3.5" />
          </button>
        )}
      </div>

      {/* Compteur de caractères (visible si proche de la limite) */}
      {(isNearLimit || isAtLimit) && (
        <p
          className={cn(
            "mt-1 text-right text-[10px]",
            isAtLimit ? "text-destructive" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {charCount}/{MAX_LENGTH}
        </p>
      )}

      <p className="mt-1 text-center text-[10px] text-muted-foreground/50">
        Entrée pour envoyer · Maj+Entrée pour saut de ligne
      </p>
    </div>
  );
}
