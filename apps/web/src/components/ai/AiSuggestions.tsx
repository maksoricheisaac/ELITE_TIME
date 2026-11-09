"use client";

import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const SUGGESTIONS = [
  "Combien d'heures ai-je travaillé cette semaine ?",
  "Qui est absent aujourd'hui dans mon équipe ?",
  "Montre-moi mes demandes de congé en attente",
  "Quels employés sont en retard ce matin ?",
] as const;

interface AiSuggestionsProps {
  onSelect: (text: string) => void;
}

export function AiSuggestions({ onSelect }: AiSuggestionsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-6">
      {/* Icône et onboarding */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex flex-col items-center gap-3 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          <Sparkles className="size-7" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            EliteTime Assistant
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Posez vos questions RH en langage naturel
          </p>
        </div>
      </motion.div>

      {/* Suggestions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
        className="flex w-full flex-col gap-2"
      >
        {SUGGESTIONS.map((suggestion, i) => (
          <motion.button
            key={i}
            onClick={() => onSelect(suggestion)}
            className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-xs text-foreground shadow-sm transition-all duration-150 hover:border-[var(--primary)]/40 hover:bg-accent hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 active:scale-[0.98]"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: 0.1 + i * 0.05 }}
            type="button"
          >
            {suggestion}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
