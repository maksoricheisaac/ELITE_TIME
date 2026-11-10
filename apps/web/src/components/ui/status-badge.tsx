import { cn } from "@/lib/utils";

export type StatusKey =
  | "normal"
  | "late"
  | "incomplete"
  | "admin_closed"
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "active"
  | "inactive";

const STATUS: Record<StatusKey, { label: string; cls: string; dot: string }> = {
  normal: { label: "À l'heure", cls: "bg-success-soft text-success", dot: "bg-success" },
  late: { label: "Retard", cls: "bg-warning-soft text-warning", dot: "bg-warning" },
  incomplete: { label: "Incomplet", cls: "bg-danger-soft text-danger", dot: "bg-danger" },
  admin_closed: { label: "Clôturé", cls: "bg-neutral-soft text-muted-foreground", dot: "bg-muted-foreground" },
  pending: { label: "En attente", cls: "bg-warning-soft text-warning", dot: "bg-warning" },
  approved: { label: "Approuvé", cls: "bg-success-soft text-success", dot: "bg-success" },
  rejected: { label: "Refusé", cls: "bg-danger-soft text-danger", dot: "bg-danger" },
  cancelled: { label: "Annulé", cls: "bg-neutral-soft text-muted-foreground", dot: "bg-muted-foreground" },
  active: { label: "Actif", cls: "bg-success-soft text-success", dot: "bg-success" },
  inactive: { label: "Inactif", cls: "bg-neutral-soft text-muted-foreground", dot: "bg-muted-foreground" },
};

/** Badge d'état (design-system/MASTER.md §6) : fond doux + texte sémantique + pastille. */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: StatusKey;
  label?: string;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        s.cls,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden="true" />
      {label ?? s.label}
    </span>
  );
}
