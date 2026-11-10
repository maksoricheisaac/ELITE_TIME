import { cn } from "@/lib/utils";

interface BreakdownCardProps {
  title: string;
  rows: { label: string; value: React.ReactNode }[];
  empty?: string;
  className?: string;
}

/** Carte « répartition » alignée sur StatCard : libellé, puis lignes libellé/valeur (valeurs tabulaires). */
export function BreakdownCard({ title, rows, empty = "Aucune donnée", className }: BreakdownCardProps) {
  return (
    <div className={cn("flex h-full flex-col rounded-xl border border-border bg-card p-4", className)}>
      <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <dl className="mt-2 divide-y divide-border text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
              <dt className="truncate text-muted-foreground" title={r.label}>
                {r.label}
              </dt>
              <dd className="tabular shrink-0 font-semibold">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
