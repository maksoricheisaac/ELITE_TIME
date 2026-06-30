"use client";

import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotification } from "@/contexts/notification-context";
import { useRouter } from "next/navigation";

export type PositionWithDepartment = {
  id: string;
  name: string;
  description: string | null;
  departmentId: string;
  department: { name: string };
};

interface PositionsTableProps {
  data: PositionWithDepartment[];
  departments: { id: string; name: string }[];
  onUpdatePosition: (formData: FormData) => void | Promise<void>;
  onDeletePosition: (formData: FormData) => void | Promise<void>;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function PositionsTable({
  data,
  departments,
  onUpdatePosition,
  onDeletePosition,
  canEdit = false,
  canDelete = false,
}: PositionsTableProps) {
  const { showSuccess, showError } = useNotification();
  const router = useRouter();
  const columns: ColumnDef<PositionWithDepartment>[] = [
    {
      accessorKey: "name",
      header: () => <span>Nom</span>,
      cell: ({ row }) => (
        <span className="font-medium block truncate max-w-[120px] sm:max-w-[200px]">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "department",
      header: () => <span className="hidden sm:block">Département</span>,
      cell: ({ row }) => (
        <span className="hidden sm:block text-sm text-muted-foreground truncate max-w-[140px]">
          {row.original.department.name}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: () => <span>Description</span>,
      cell: ({ row }) => {
        const desc = row.original.description;
        if (!desc) return <span className="text-sm text-muted-foreground">-</span>;
        const truncated = desc.length > 50 ? desc.slice(0, 50).trimEnd() + "…" : desc;
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm text-muted-foreground cursor-default block truncate max-w-[140px] sm:max-w-[250px]">
                  {truncated}
                </span>
              </TooltipTrigger>
              {desc.length > 50 && (
                <TooltipContent className="max-w-xs whitespace-pre-wrap">
                  {desc}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      cell: ({ row }) => {
        const position = row.original;

        return (
          <div className="flex flex-wrap justify-end gap-2">
            <TooltipProvider delayDuration={0}>
              {/* Modifier */}
              {canEdit && (
                <Dialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button className="cursor-pointer h-8 w-8 p-0" type="button" variant="outline" size="sm">
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Modifier</span>
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Modifier</TooltipContent>
                  </Tooltip>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Modifier le poste</DialogTitle>
                      <DialogDescription>
                        Modifiez les informations du poste.
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);

                        try {
                          await onUpdatePosition(formData);
                          showSuccess("Poste mis à jour avec succès");
                          router.refresh();
                        } catch {
                          showError("Erreur lors de la mise à jour du poste");
                        }
                      }}
                      className="space-y-4"
                    >
                      <input type="hidden" name="id" value={position.id} />
                      <div className="space-y-2">
                        <Label htmlFor={`edit-name-${position.id}`}>
                          Nom du poste
                        </Label>
                        <Input
                          id={`edit-name-${position.id}`}
                          name="name"
                          defaultValue={position.name}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-department-${position.id}`}>
                          Département
                        </Label>
                        <Select name="departmentId" defaultValue={position.departmentId} required>
                          <SelectTrigger id={`edit-department-${position.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-description-${position.id}`}>
                          Description
                        </Label>
                        <Input
                          id={`edit-description-${position.id}`}
                          name="description"
                          defaultValue={position.description ?? ""}
                          placeholder="Description du poste (optionnel)"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button className="cursor-pointer" type="submit">
                          <Pencil className="h-3 w-3" />
                          <span>Enregistrer</span>
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )}

              {/* Supprimer */}
              {canDelete && (
                <Dialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button className="cursor-pointer h-8 w-8 p-0" type="button" variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Supprimer</span>
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Supprimer</TooltipContent>
                  </Tooltip>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Supprimer le poste</DialogTitle>
                      <DialogDescription>
                        Cette action est irréversible. Êtes-vous sûr de vouloir supprimer ce
                        poste&nbsp;?
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      className="flex justify-end gap-2"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);

                        try {
                          await onDeletePosition(formData);
                          showSuccess("Poste supprimé avec succès");
                          router.refresh();
                        } catch {
                          showError("Erreur lors de la suppression du poste");
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={position.id} />
                      <Button className="cursor-pointer" type="submit" variant="destructive">
                        <Trash2 className="h-3 w-3" />
                        <span>Confirmer</span>
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </TooltipProvider>
          </div>
        );
      },
    },
  ];

  return <DataTable columns={columns} data={data} />;
}
