"use client";

import { Fragment, useState, type ComponentType, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface RowActionItem {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  /** Action immédiate */
  onSelect?: () => void;
  /** Ouvre un dialogue contrôlé (rendu HORS du menu, qui se démonte à la fermeture) */
  dialog?: (p: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
  /** Demande une confirmation avant d'exécuter `onConfirm` */
  confirm?: { title: string; description: ReactNode; confirmLabel?: string; onConfirm: () => void };
  destructive?: boolean;
  disabled?: boolean;
  /** Explique pourquoi l'action est indisponible (affiché sous le libellé) */
  disabledReason?: string;
}

/**
 * Colonne « Actions » des tableaux : bouton « ⋯ » → menu (design-system/MASTER.md §6).
 * Les actions destructives sont séparées et en rouge ; l'indisponibilité est expliquée.
 * Dialogues et confirmations vivent à côté du menu : un item de menu se démonte à la fermeture et
 * emporterait avec lui un dialogue qui lui serait imbriqué.
 */
export function RowActions({
  label,
  items,
  disabled,
}: {
  /** « Actions pour <nom> » : libellé accessible du bouton */
  label: string;
  items: RowActionItem[];
  disabled?: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (items.length === 0) return null;

  const normal = items.filter((i) => !i.destructive);
  const destructive = items.filter((i) => i.destructive);

  const renderItem = (i: RowActionItem) => {
    const Icon = i.icon;
    return (
      <DropdownMenuItem
        key={i.key}
        disabled={i.disabled}
        className={`cursor-pointer ${i.destructive ? "text-destructive focus:text-destructive" : ""}`}
        onSelect={() => {
          if (i.dialog || i.confirm) setOpenKey(i.key);
          else i.onSelect?.();
        }}
      >
        {Icon && <Icon className="size-4" aria-hidden="true" />}
        <span className="flex flex-col">
          {i.label}
          {i.disabled && i.disabledReason && (
            <span className="text-[11px] font-normal text-muted-foreground">{i.disabledReason}</span>
          )}
        </span>
      </DropdownMenuItem>
    );
  };

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="size-8 cursor-pointer p-0 data-[state=open]:bg-accent"
            aria-label={label}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {normal.map(renderItem)}
          {normal.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
          {destructive.map(renderItem)}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Montés en permanence (ouverts via openKey) : la fermeture garde son animation de sortie */}
      {items.map((i) =>
        i.dialog ? (
          <Fragment key={`dialog-${i.key}`}>
            {i.dialog({ open: openKey === i.key, onOpenChange: (o) => setOpenKey(o ? i.key : null) })}
          </Fragment>
        ) : null,
      )}

      {items.map((i) =>
        i.confirm ? (
          <AlertDialog key={`confirm-${i.key}`} open={openKey === i.key} onOpenChange={(o) => setOpenKey(o ? i.key : null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{i.confirm.title}</AlertDialogTitle>
                <AlertDialogDescription>{i.confirm.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    setOpenKey(null);
                    i.confirm?.onConfirm();
                  }}
                >
                  {i.confirm.confirmLabel ?? "Confirmer"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null,
      )}
    </div>
  );
}
