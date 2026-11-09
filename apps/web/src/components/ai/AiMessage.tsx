"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiMessage as AiMessageType } from "@/hooks/use-ai-chat";

/** Curseur clignotant pendant le streaming */
function StreamingCursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.8, repeat: Infinity }}
      className="ml-0.5 inline-block h-3.5 w-0.5 bg-current align-middle"
      aria-hidden="true"
    />
  );
}

// ─── Rendu texte sûr ──────────────────────────────────────────────────────────
// Pas de dangerouslySetInnerHTML — rendu React pur, XSS impossible

type TextSegment =
  | { type: "bold"; text: string }
  | { type: "code"; text: string }
  | { type: "text"; text: string };

function parseInline(line: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Pattern : **bold** ou `code`
  const re = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: "text", text: line.slice(cursor, match.index) });
    }
    if (match[0].startsWith("**")) {
      segments.push({ type: "bold", text: match[2] });
    } else {
      segments.push({ type: "code", text: match[3] });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    segments.push({ type: "text", text: line.slice(cursor) });
  }
  return segments;
}

function SafeText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {parseInline(line).map((seg, j) => {
            if (seg.type === "bold")
              return <strong key={j} className="font-semibold">{seg.text}</strong>;
            if (seg.type === "code")
              return (
                <code
                  key={j}
                  className="rounded bg-muted px-1 py-0.5 font-mono text-xs"
                >
                  {seg.text}
                </code>
              );
            return <span key={j}>{seg.text}</span>;
          })}
        </span>
      ))}
    </>
  );
}

// ─── Labels outils ────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  get_my_hours: "Mes heures",
  get_absent_today: "Absents du jour",
  get_late_employees: "Retards",
  get_leave_requests: "Congés",
  get_team_attendance: "Présences",
  get_department_statistics: "Stats département",
  get_my_leaves_summary: "Résumé congés",
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

// ─── Composant message ────────────────────────────────────────────────────────

interface AiMessageProps {
  message: AiMessageType;
}

export const AiMessage = memo(function AiMessage({ message }: AiMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "flex items-start gap-2 px-1",
        isUser && "flex-row-reverse",
      )}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-sm">
          <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
            <path
              d="M8 1.5a2 2 0 0 1 2 2v.5h1A1.5 1.5 0 0 1 12.5 5.5v7A1.5 1.5 0 0 1 11 14H5a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 5 4h1V3.5a2 2 0 0 1 2-2ZM6.5 4h3V3.5a1.5 1.5 0 0 0-3 0V4ZM5 5a.5.5 0 0 0-.5.5V6h7V5.5A.5.5 0 0 0 11 5H5Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}

      <div className={cn("flex max-w-[85%] flex-col gap-1", isUser && "items-end")}>
        {/* Bulle de message */}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
            isUser
              ? "rounded-tr-sm bg-[var(--primary)] text-white"
              : message.isError
                ? "rounded-tl-sm border border-destructive/30 bg-destructive/5 text-destructive dark:bg-destructive/10"
                : "rounded-tl-sm border border-border bg-card text-card-foreground",
          )}
        >
          {message.isError && (
            <AlertCircle className="mb-1 inline-block size-3.5 text-destructive" />
          )}{" "}
          <SafeText text={message.content} />
          {message.isStreaming && !message.isError && <StreamingCursor />}
        </div>

        {/* Outils utilisés */}
        {!isUser && (message.toolsUsed?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1 px-0.5">
            {message.toolsUsed!.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                <Wrench className="size-2.5" aria-hidden="true" />
                {toolLabel(tool)}
              </span>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <time
          className="px-0.5 text-[10px] text-muted-foreground/60"
          dateTime={message.timestamp.toISOString()}
        >
          {message.timestamp.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
    </motion.div>
  );
});
