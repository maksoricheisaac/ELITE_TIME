import * as React from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Étiquette de section (surtitre discret) */
  badge?: string;
  className?: string;
  /** Actions à droite (filtres, boutons) — sous le titre sur mobile */
  actions?: React.ReactNode;
  /** Alias historique de `actions` */
  children?: React.ReactNode;
}

/** En-tête de page standard (design-system/MASTER.md §4) : un seul <h1> par page. */
export function PageHeader({ title, description, badge, className, actions, children }: PageHeaderProps) {
  const right = actions ?? children
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 flex-1 space-y-1">
        {badge && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{badge}</p>
        )}
        <h1 className="text-xl font-semibold tracking-[-0.022em] text-foreground sm:text-2xl">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {right && (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:min-w-[240px] sm:justify-end">
          {right}
        </div>
      )}
    </div>
  )
}
