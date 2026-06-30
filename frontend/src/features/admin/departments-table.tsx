"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { Department } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Pencil, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  departmentUpdateFormSchema,
  type DepartmentUpdateFormValues,
} from "@/schemas/admin/forms/departments";
import { useNotification } from "@/contexts/notification-context";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export type DepartmentWithEmployeeCount = Department & { employeesCount: number };

interface DepartmentsTableProps {
  data: DepartmentWithEmployeeCount[];
  onUpdateDepartment: (formData: FormData) => void | Promise<void>;
  onDeleteDepartment: (formData: FormData) => void | Promise<void>;
  canEdit?: boolean;
  canDelete?: boolean;
}


interface DepartmentEditDialogProps {
  department: DepartmentWithEmployeeCount;
  onUpdateDepartment: (formData: FormData) => void | Promise<void>;
}

function DepartmentEditDialog({ department, onUpdateDepartment }: DepartmentEditDialogProps) {
  const [isPending, startTransition] = useTransition();
  const { showSuccess, showError } = useNotification();
  const router = useRouter();
  const form = useForm<DepartmentUpdateFormValues>({
    resolver: zodResolver(departmentUpdateFormSchema),
    defaultValues: {
      id: department.id,
      name: department.name,
      description: department.description ?? "",
    },
    mode: "onSubmit",
  });

  const onSubmit = (values: DepartmentUpdateFormValues) => {
    startTransition(() => {
      const formData = new FormData();
      formData.append("id", values.id);
      formData.append("name", values.name);
      formData.append("description", values.description ?? "");

      void Promise.resolve(onUpdateDepartment(formData))
        .then(() => {
          showSuccess("Département mis à jour avec succès");
          router.refresh();
        })
        .catch(() => {
          showError("Erreur lors de la mise à jour du département");
        });
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <input type="hidden" name="id" value={department.id} />
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nom du département</FormLabel>
                <FormControl>
                  <Input
                    id={`edit-name-${department.id}`}
                    placeholder="Nom du département"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description du département</FormLabel>
                <FormControl>
                  <Input
                    id={`edit-description-${department.id}`}
                    placeholder="Description courte du département (optionnel)"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            className="cursor-pointer"
            type="submit"
            disabled={form.formState.isSubmitting || isPending}
          >
            Enregistrer
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function DepartmentsTable({
  data,
  onUpdateDepartment,
  onDeleteDepartment,
  canEdit = false,
  canDelete = false,
}: DepartmentsTableProps) {
  const { showSuccess, showError } = useNotification();
  const router = useRouter();
  const columns: ColumnDef<DepartmentWithEmployeeCount>[] = [
    {
      accessorKey: "name",
      header: () => <span>Nom</span>,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "description",
      header: () => <span>Description</span>,
      cell: ({ row }) => {
        const desc = row.original.description;
        if (!desc) return <span className="text-sm text-muted-foreground">-</span>;
        const truncated = desc.length > 60 ? desc.slice(0, 60).trimEnd() + "…" : desc;
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm text-muted-foreground cursor-default block truncate max-w-[160px] sm:max-w-[260px]">
                  {truncated}
                </span>
              </TooltipTrigger>
              {desc.length > 60 && (
                <TooltipContent className="max-w-xs whitespace-pre-wrap">{desc}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      accessorKey: "employeesCount",
      header: () => <span className="block text-center">Employés</span>,
      cell: ({ row }) => {
        const count = row.original.employeesCount;
        const employeesLabel =
          count === 0 ? "0 employé" : count === 1 ? "1 employé" : `${count} employés`;

        const employeesClassName =
          count === 0
            ? "text-xs text-muted-foreground"
            : "inline-flex items-center rounded-full bg-primary/5 px-2 py-1 text-xs font-medium text-primary";

        return <span className={employeesClassName}>{employeesLabel}</span>;
      },
    },
    {
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      cell: ({ row }) => {
        const department = row.original;
        const count = department.employeesCount;

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
                      <DialogTitle>Modifier le département</DialogTitle>
                      <DialogDescription>
                        Renommez le département et mettez à jour les employés associés.
                      </DialogDescription>
                    </DialogHeader>
                    <DepartmentEditDialog
                      department={department}
                      onUpdateDepartment={onUpdateDepartment}
                    />
                  </DialogContent>
                </Dialog>
              )}

              {/* Supprimer */}
              {canDelete && (
                <Dialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={count > 0}
                          className="cursor-pointer h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Supprimer</span>
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Supprimer</TooltipContent>
                  </Tooltip>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Supprimer le département</DialogTitle>
                      <DialogDescription>
                        Cette action est irréversible. Êtes-vous sûr de vouloir supprimer ce
                        département&nbsp;?
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      className="flex justify-end gap-2"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);

                        try {
                          await onDeleteDepartment(formData);
                          showSuccess("Département supprimé avec succès");
                          router.refresh();
                        } catch {
                          showError("Erreur lors de la suppression du département");
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={department.id} />
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
