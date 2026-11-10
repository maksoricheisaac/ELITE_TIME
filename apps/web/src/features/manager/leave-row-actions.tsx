"use client";

import { useState } from "react";
import { Check, MoreHorizontal, Pencil, Trash2, X, Ban } from "lucide-react";
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

interface LeaveRowActionsProps {
  /** Libellé accessible : « Actions pour <employé> » */
  employeeName: string;
  disabled?: boolean;
  /** Une action n'apparaît que si le handler est fourni (permission + statut autorisés) */
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onHide?: () => void;
}

/**
 * Menu d'actions d'une ligne de congé (bouton « ⋯ »).
 * Les confirmations (annuler / supprimer) sont des AlertDialog contrôlés placés
 * HORS du menu : un item de menu se démonte à la fermeture, ce qui fermerait
 * aussi la boîte de dialogue s'ils étaient imbriqués.
 */
export function LeaveRowActions({
  employeeName,
  disabled,
  onApprove,
  onReject,
  onEdit,
  onCancel,
  onHide,
}: LeaveRowActionsProps) {
  const [confirm, setConfirm] = useState<"cancel" | "hide" | null>(null);

  const hasDecision = Boolean(onApprove || onReject);
  const hasEdit = Boolean(onEdit);
  const hasDestructive = Boolean(onCancel || onHide);
  if (!hasDecision && !hasEdit && !hasDestructive) return null;

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
            aria-label={`Actions pour ${employeeName}`}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {onApprove && (
            <DropdownMenuItem className="cursor-pointer" onSelect={onApprove}>
              <Check className="size-4" aria-hidden="true" />
              Approuver
            </DropdownMenuItem>
          )}
          {onReject && (
            <DropdownMenuItem className="cursor-pointer" onSelect={onReject}>
              <X className="size-4" aria-hidden="true" />
              Rejeter…
            </DropdownMenuItem>
          )}
          {hasDecision && (hasEdit || hasDestructive) && <DropdownMenuSeparator />}
          {onEdit && (
            <DropdownMenuItem className="cursor-pointer" onSelect={onEdit}>
              <Pencil className="size-4" aria-hidden="true" />
              Modifier
            </DropdownMenuItem>
          )}
          {hasEdit && hasDestructive && <DropdownMenuSeparator />}
          {onCancel && (
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onSelect={() => setConfirm("cancel")}
            >
              <Ban className="size-4" aria-hidden="true" />
              Annuler le congé
            </DropdownMenuItem>
          )}
          {onHide && (
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onSelect={() => setConfirm("hide")}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Supprimer de la liste
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm === "cancel"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler ce congé ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le congé de {employeeName} sera marqué comme annulé et ne sera plus pris en compte dans les
              pointages et les rapports. Cette action est tracée dans l&apos;historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirm(null);
                onCancel?.();
              }}
            >
              Annuler le congé
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "hide"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce congé de la liste ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette ligne ne sera plus affichée dans la liste des congés. La donnée est conservée en base de
              données et reste consultable si nécessaire.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirm(null);
                onHide?.();
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
