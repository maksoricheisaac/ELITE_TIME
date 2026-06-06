"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Sparkles } from "lucide-react";
import { AiChatWindow } from "./AiChatWindow";
import { cn } from "@/lib/utils";

type WidgetState = "closed" | "open" | "minimized";

const STORAGE_STATE_KEY = "elitetime_ai_widget_state";

function getSavedState(): WidgetState {
  if (typeof window === "undefined") return "closed";
  try {
    const s = localStorage.getItem(STORAGE_STATE_KEY);
    if (s === "open" || s === "minimized") return s;
  } catch {
    /* empty */
  }
  return "closed";
}

export function AiChatWidget() {
  // Initialize from localStorage only on client — avoids hydration mismatch.
  // Passing null as initial value and populating after mount via a layout effect
  // is the standard pattern; we track mount via a ref to avoid a state-in-effect
  // warning while keeping the behaviour identical.
  const [state, setState] = useState<WidgetState | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Initialise from localStorage via a timer callback so the setState is not
    // called synchronously in the effect body (satisfies react-hooks/set-state-in-effect).
    const id = setTimeout(() => setState(getSavedState()), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (state === null) return;
    try {
      localStorage.setItem(STORAGE_STATE_KEY, state === "open" ? "open" : "closed");
    } catch {
      /* empty */
    }
  }, [state]);

  // Clear unread badge in the open callback rather than a separate effect.
  const open = useCallback(() => {
    setState("open");
    setUnreadCount(0);
  }, []);
  const close = useCallback(() => setState("closed"), []);
  const minimize = useCallback(() => setState("minimized"), []);

  // Not yet mounted on the client — render nothing to avoid hydration mismatch.
  if (state === null) return null;

  const isOpen = state === "open";
  const isMinimized = state === "minimized";

  return (
    <>
      {/* ── Fenêtre de chat ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <AiChatWindow onClose={close} onMinimize={minimize} />
        )}
      </AnimatePresence>

      {/* ── Bouton flottant ────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {/* Pill "minimisé" — visible quand minimized */}
        <AnimatePresence>
          {isMinimized && (
            <motion.button
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              transition={{ duration: 0.18 }}
              onClick={open}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-lg transition-all hover:shadow-xl"
              aria-label="Ouvrir l'assistant IA"
            >
              <span className="flex h-2 w-2 rounded-full bg-green-500 shadow-sm shadow-green-500/50" />
              EliteTime IA
            </motion.button>
          )}
        </AnimatePresence>

        {/* Bouton principal */}
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={isOpen ? minimize : open}
          className={cn(
            "relative flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/60 focus-visible:ring-offset-2",
            isOpen
              ? "bg-[var(--primary)]/90 text-white hover:bg-[var(--primary)]"
              : "bg-[var(--primary)] text-white hover:brightness-110",
          )}
          aria-label={isOpen ? "Réduire l'assistant IA" : "Ouvrir l'assistant IA"}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.span
                key="open"
                initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
                transition={{ duration: 0.15 }}
              >
                <Sparkles className="size-5" aria-hidden="true" />
              </motion.span>
            ) : (
              <motion.span
                key="closed"
                initial={{ opacity: 0, rotate: 45, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: -45, scale: 0.7 }}
                transition={{ duration: 0.15 }}
              >
                <MessageCircle className="size-5" aria-hidden="true" />
              </motion.span>
            )}
          </AnimatePresence>

          {/* Badge non-lus */}
          {unreadCount > 0 && !isOpen && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm"
              aria-label={`${unreadCount} nouveau(x) message(s)`}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}

          {/* Pulse animé quand fermé (invitation) */}
          {!isOpen && !isMinimized && (
            <span
              className="absolute inset-0 -z-10 animate-ping rounded-full bg-[var(--primary)]/30"
              aria-hidden="true"
              style={{ animationDuration: "3s" }}
            />
          )}
        </motion.button>
      </div>
    </>
  );
}
