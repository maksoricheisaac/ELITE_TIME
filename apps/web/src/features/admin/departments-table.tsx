"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { Department } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Pencil, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  departmentUpdateFormSchema,
  type DepartmentUpdateFormValues } from "@/schemas/admin/forms/departments";
import { useNotification } from "@/contexts/notification-context";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { RowActions } from "@/components/ui/row-actions";
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
      description: department.description ?? "" },
    mode: "onSubmit" });

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
  canDelete = false }: DepartmentsTableProps) {
  const { showSuccess, showError } = useNotification();
  const router = useRouter();
  const columns: ColumnDef<DepartmentWithEmployeeCount>[] = [
    {
      accessorKey: "name",
      header: () => <span>Nom</span>,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
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
      } },
    {
      accessorKey: "employeesCount",
      header: () => <span>Employés</span>,
      cell: ({ row }) => {
        const count = row.original.employeesCount;
        const max = Math.max(1, ...data.map((d) => d.employeesCount));
        return (
          <div className="flex min-w-[8rem] items-center gap-3">
            <span className={`tabular w-6 text-right font-medium ${count === 0 ? "text-muted-foreground" : ""}`}>{count}</span>
            <span className="h-1.5 flex-1 rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full rounded-full bg-chart-1" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="sr-only">{count === 1 ? "1 employé" : `${count} employés`}</span>
          </div>
        );
      } },
    {
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      cell: ({ row }) => {
        const department = row.original;
        const count = department.employeesCount;

        return (
          <RowActions
            label={`Actions pour ${department.name}`}
            items={[
              ...(canEdit
                ? [
                    {
                      key: "edit",
                      label: "Modifier",
                      icon: Pencil,
                      dialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => (
                        <Dialog open={open} onOpenChange={onOpenChange}>
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
                      ) },
                  ]
                : []),
              ...(canDelete
                ? [
                    {
                      key: "delete",
                      label: "Supprimer",
                      icon: Trash2,
                      destructive: true,
                disabled: count > 0,
                disabledReason: "Contient des employés",
                      dialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => (
                        <Dialog open={open} onOpenChange={onOpenChange}>
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
                      ) },
                  ]
                : []),
            ]}
          />
        );
      } },
  ];

  // Une colonne « Description » entièrement vide n'apporte rien : on la masque
  const hasDescriptions = data.some((d) => d.description);
  const visibleColumns = columns.filter(
    (c) => hasDescriptions || (c as { accessorKey?: string }).accessorKey !== "description",
  );
  return <DataTable columns={visibleColumns} data={data} />;
}
