"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

const PHASES = [
  "Analyse de votre demande…",
  "Consultation des données RH…",
  "Vérification des permissions…",
  "Formulation de la réponse…",
  "Traitement en cours…",
];

// Heights (px) pour chaque barre de l'equalizer — séquences décalées
const BARS = [
  { h: [3, 14, 6, 12, 3], delay: 0 },
  { h: [8, 4, 16, 5, 8],  delay: 0.1 },
  { h: [4, 18, 3, 14, 4], delay: 0.2 },
  { h: [12, 5, 10, 4, 12], delay: 0.15 },
  { h: [5, 12, 4, 18, 5], delay: 0.05 },
  { h: [3, 8, 14, 6, 3],  delay: 0.25 },
  { h: [10, 3, 8, 3, 10], delay: 0.3 },
];

export function AiTypingIndicator() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setPhase((p) => (p + 1) % PHASES.length),
      2800,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-start gap-2 px-1">
      {/* Avatar avec pulse */}
      <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
        {/* Anneaux concentriques */}
        {[1.8, 1.4].map((scale, i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full bg-[var(--primary)]"
            animate={{ scale: [1, scale, 1], opacity: [0.35, 0, 0.35] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              delay: i * 0.7,
              ease: "easeOut",
            }}
          />
        ))}
        {/* Icône centrale */}
        <motion.div
          className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-white"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg viewBox="0 0 16 16" fill="none" className="size-3.5" aria-hidden="true">
            <path
              d="M8 1.5a2 2 0 0 1 2 2v.5h1A1.5 1.5 0 0 1 12.5 5.5v7A1.5 1.5 0 0 1 11 14H5a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 5 4h1V3.5a2 2 0 0 1 2-2ZM6.5 4h3V3.5a1.5 1.5 0 0 0-3 0V4ZM5 5a.5.5 0 0 0-.5.5V6h7V5.5A.5.5 0 0 0 11 5H5Z"
              fill="currentColor"
            />
          </svg>
        </motion.div>
      </div>

      {/* Bulle principale */}
      <div
        role="status"
        aria-label="L'assistant IA réfléchit"
        className="relative overflow-hidden rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 shadow-sm"
      >
        {/* Shimmer de fond */}
        <motion.div
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[var(--primary)]/8 to-transparent"
          animate={{ translateX: ["-100%", "200%"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear", repeatDelay: 0.8 }}
        />

        <div className="relative flex flex-col gap-1.5">
          {/* Equalizer */}
          <div className="flex items-end gap-[3px] h-[18px]">
            {BARS.map((bar, i) => (
              <motion.span
                key={i}
                className="block w-[3px] rounded-full bg-[var(--primary)]"
                animate={{
                  height: bar.h.map((v) => `${v}px`),
                  opacity: bar.h.map((v) => 0.4 + (v / 18) * 0.6),
                }}
                transition={{
                  duration: 1.1,
                  repeat: Infinity,
                  delay: bar.delay,
                  ease: "easeInOut",
                  times: [0, 0.25, 0.5, 0.75, 1],
                }}
              />
            ))}
          </div>

          {/* Label rotatif */}
          <div className="h-[14px] overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.span
                key={phase}
                className="flex items-center text-[10px] font-medium text-muted-foreground/80 whitespace-nowrap tracking-wide"
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {PHASES[phase]}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
