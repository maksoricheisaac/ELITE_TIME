import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const dot: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Ligne de contexte issue des données réelles (ex. « sur 12 actifs ») */
  hint?: ReactNode;
  /** État sémantique : pastille + libellé, jamais la couleur seule */
  tone?: Tone;
  toneLabel?: string;
  /** Lien « voir » vers la liste filtrée correspondante */
  href?: string;
  className?: string;
}

/**
 * Carte KPI (design-system/MASTER.md §6) : libellé, valeur tabulaire, contexte.
 * Aucun pictogramme décoratif ni jauge sans donnée réelle.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  toneLabel,
  href,
  className,
}: StatCardProps) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border border-border bg-card p-4",
        href && "transition-colors hover:border-brand-500/60",
        className,
      )}
    >
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="tabular text-2xl font-semibold leading-none text-foreground sm:text-[28px]">
          {value}
        </p>
        {toneLabel && (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className={cn("size-2 rounded-full", dot[tone])} aria-hidden="true" />
            {toneLabel}
          </span>
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return href ? (
    <Link
      href={href}
      prefetch={false}
      className="block rounded-xl focus-visible:outline-offset-2"
    >
      {body}
    </Link>
  ) : (
    body
  );
}
