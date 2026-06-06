"use client";

import { useState, useTransition, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, RefreshCw, Trash } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { User } from "@/types/models";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Switch } from "@/components/ui/switch";
import { EmployeesFilters } from "./employees-filters";
import {
  employeeUpdateFormSchema,
  type EmployeeUpdateFormInput,
  type EmployeeUpdateFormValues,
} from "@/schemas/admin/forms/employees";

interface DepartmentOption {
  id: string;
  name: string;
}

interface PositionWithDepartment {
  id: string;
  name: string;
  department: {
    name: string;
  } | null;
}

interface EmployeesTableProps {
  employees: User[];
  currentUserRole: User["role"];
  departments: DepartmentOption[];
  positions: PositionWithDepartment[];
  onUpdateEmployee: (formData: FormData) => void;
  onSyncFromLdap: () => Promise<void> | void;
  onSoftDeleteEmployee: (userId: string) => Promise<void> | void;
  onToggleIncludeInReports: (userId: string, include: boolean) => Promise<void> | void;
}


interface EmployeeEditDialogProps {
  employee: User;
  departments: DepartmentOption[];
  positions: PositionWithDepartment[];
  onUpdateEmployee: (formData: FormData) => void;
}

function EmployeeEditDialog({
  employee,
  departments,
  positions,
  onUpdateEmployee,
}: EmployeeEditDialogProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<EmployeeUpdateFormInput, unknown, EmployeeUpdateFormValues>({
    resolver: zodResolver(employeeUpdateFormSchema),
    defaultValues: {
      id: employee.id,
      firstname: employee.firstname || "",
      lastname: employee.lastname || "",
      email: employee.email || "",
      role: employee.role,
      status: employee.status,
      department: employee.department || "__none",
      position: employee.position || "__none",
    },
    mode: "onSubmit",
  });

  // Obtenir le département sélectionné pour filtrer les postes
  const selectedDepartment = useWatch({ control: form.control, name: "department" });

  // Filtrer les postes en fonction du département sélectionné
  const filteredPositions = useMemo(() => {
    if (selectedDepartment === "__none" || !selectedDepartment) {
      return positions;
    }
    // Trouver l'ID du département sélectionné
    const deptId = departments.find((d) => d.name === selectedDepartment)?.id;
    if (!deptId) return positions;

    // Filtrer les postes qui appartiennent à ce département
    return positions.filter((p) => p.department?.name === selectedDepartment);
  }, [positions, selectedDepartment, departments]);

  // Réinitialiser le poste lorsque le département change
  const handleDepartmentChange = (value: string) => {
    form.setValue("department", value);
    // Vérifier si le poste actuel appartient au nouveau département
    const currentPosition = form.getValues("position");
    if (currentPosition && currentPosition !== "__none") {
      const positionBelongsToDept = filteredPositions.some((p) => p.name === currentPosition);
      if (!positionBelongsToDept) {
        form.setValue("position", "__none");
      }
    }
  };

  const onSubmit = (values: EmployeeUpdateFormValues) => {
    startTransition(async () => {
      const formData = new FormData();

      formData.append("id", values.id);
      formData.append("firstname", values.firstname ?? "");
      formData.append("lastname", values.lastname ?? "");
      formData.append("email", values.email ?? "");
      formData.append("role", values.role);
      formData.append("status", values.status);
      formData.append("department", values.department ?? "__none");
      formData.append("position", values.position ?? "__none");

      await onUpdateEmployee(formData);
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        noValidate
      >
        <input type="hidden" name="id" value={employee.id} />

        {/* Prénom / Nom – 2 colonnes */}
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="firstname"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prénom</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lastname"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nom</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Email – pleine largeur */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input 
                  type="email"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  className="w-full"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Rôle – pleine largeur */}
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rôle</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" id={`role-${employee.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employé</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Statut – pleine largeur (disabled) */}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Statut (géré par l&apos;AD)</FormLabel>
              <FormControl>
                <Select value={field.value} disabled>
                  <SelectTrigger className="w-full" id={`status-${employee.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Actif</SelectItem>
                    <SelectItem value="inactive">Inactif</SelectItem>
                    <SelectItem value="deleted">Supprimé</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Département – pleine largeur */}
        <FormField
          control={form.control}
          name="department"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Département</FormLabel>
              <FormControl>
                <Select
                  value={field.value ?? "__none"}
                  onValueChange={handleDepartmentChange}
                >
                  <SelectTrigger
                    className="w-full"
                    id={`department-${employee.id}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Aucun</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.name}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Poste – pleine largeur (filtré par département) */}
        <FormField
          control={form.control}
          name="position"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Poste
                {selectedDepartment && selectedDepartment !== "__none" && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (filtrés par département)
                  </span>
                )}
              </FormLabel>
              <FormControl>
                <Select
                  value={field.value ?? "__none"}
                  onValueChange={field.onChange}
                  disabled={filteredPositions.length === 0}
                >
                  <SelectTrigger
                    className="w-full"
                    id={`position-${employee.id}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">
                      {filteredPositions.length === 0 ? "Aucun poste disponible" : "Aucun"}
                    </SelectItem>
                    {filteredPositions.map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button type="submit" className="cursor-pointer" disabled={isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Form>
  );
}


export default function EmployeesTable({
  employees,
  currentUserRole,
  departments,
  positions,
  onUpdateEmployee,
  onSyncFromLdap,
  onSoftDeleteEmployee,
  onToggleIncludeInReports,
}: EmployeesTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isDeleting, startDeleteTransition] = useTransition();
  const ROLE_LABELS: Record<string, string> = {
    employee: "Employé",
    team_lead: "Chef d'équipe",
    manager: "Manager",
    admin: "Admin",
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "name",
      header: () => <span>Nom</span>,
      cell: ({ row }) => {
        const e = row.original;
        return (
          <div className="flex flex-col min-w-0">
            <span className="font-medium truncate">
              {e.firstname} {e.lastname}
            </span>
            {/* email visible uniquement quand la colonne email est masquée */}
            <span className="text-xs text-muted-foreground truncate sm:hidden">
              {e.email || ""}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      header: () => <span>Email</span>,
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.email || "—"}</span>
      ),
    },
    {
      accessorKey: "role",
      header: () => <span>Rôle</span>,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {ROLE_LABELS[row.original.role] ?? row.original.role}
        </Badge>
      ),
    },
    {
      accessorKey: "department",
      header: () => <span>Département</span>,
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => (
        <span className="text-sm">{row.original.department || "—"}</span>
      ),
    },
    {
      accessorKey: "position",
      header: () => <span>Poste</span>,
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.position || "—"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: () => <span>Statut</span>,
      cell: ({ row }) => {
        const e = row.original;
        const label = e.status === "active" ? "Actif" : e.status === "inactive" ? "Inactif" : "Supprimé";
        const variant =
          e.status === "active" ? "success" : e.status === "inactive" ? "warning" : "destructive";
        return (
          <Badge variant={variant} className="text-xs">
            {label}
          </Badge>
        );
      },
    },
    {
      id: "includeInReports",
      header: () => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-xs font-medium">Rapports</span>
            </TooltipTrigger>
            <TooltipContent>Inclure dans les rapports PDF/Excel/Email</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
      cell: ({ row }) => {
        const e = row.original;
        const included = e.includeInReports ?? true;
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={included}
                    onCheckedChange={(checked) => {
                      void onToggleIncludeInReports(e.id, checked);
                    }}
                    aria-label="Inclure dans les rapports"
                  />
                  <span className={`text-xs font-medium ${included ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground line-through"}`}>
                    {included ? "Inclus" : "Exclu"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {included
                  ? "Inclus dans tous les rapports (PDF, Excel, Email)"
                  : "Exclu de tous les rapports (PDF, Excel, Email)"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      cell: ({ row }) => {
        const e = row.original;

        if (currentUserRole !== "admin") {
          return null;
        }

        return (
          <div className="flex justify-end gap-2">
            <TooltipProvider>
              <Dialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild suppressHydrationWarning>
                      <Button className="cursor-pointer h-8 w-8 p-0" type="button" variant="outline" size="sm">
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Modifier</span>
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Modifier</TooltipContent>
                </Tooltip>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Modifier l&apos;employé</DialogTitle>
                    <DialogDescription>
                      Mettez à jour les informations de l&apos;employé.
                    </DialogDescription>
                  </DialogHeader>
                  <EmployeeEditDialog
                    employee={e}
                    departments={departments}
                    positions={positions}
                    onUpdateEmployee={onUpdateEmployee}
                  />
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        className="cursor-pointer h-8 w-8 p-0"
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isDeleting || e.status === "deleted"}
                      >
                        <Trash className="h-4 w-4" />
                        <span className="sr-only">Supprimer</span>
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Supprimer</TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cet utilisateur ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      L&apos;utilisateur sera marqué comme &quot;supprimé&quot; et ne pourra plus se connecter. Cette action
                      est réversible uniquement via une modification manuelle de son statut.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        startDeleteTransition(async () => {
                          await onSoftDeleteEmployee(e.id);
                        });
                      }}
                    >
                      Confirmer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TooltipProvider>
          </div>
        );
      },
    },
  ];

  const [isSyncing, startSyncTransition] = useTransition();

  const rolePriority: Record<User["role"], number> = {
    employee: 0,
    team_lead: 1,
    manager: 2,
    admin: 3,
  };

  const statusPriority: Record<User["status"], number> = {
    active: 0,
    inactive: 1,
    deleted: 2,
  };

  const sortedEmployees = [...employees].sort((a, b) => {
    // 1. Tri par statut (Actif, Inactif, Supprimé)
    const statusDiff = statusPriority[a.status] - statusPriority[b.status];
    if (statusDiff !== 0) return statusDiff;

    // 2. Tri par rôle (Employé, Chef d'équipe, Manager, Admin)
    const roleDiff = rolePriority[a.role] - rolePriority[b.role];
    if (roleDiff !== 0) return roleDiff;

    // 3. Tri alphabétique (Prénom)
    return (a.firstname ?? "").localeCompare(b.firstname ?? "");
  });

  const totalItems = sortedEmployees.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEmployees = sortedEmployees.slice(startIndex, endIndex);

  return (
    <Card className="border-border/50 py-0">
      <CardHeader className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between border-b border-border/40">
        <div>
          <CardTitle className="text-base">Liste des employés
            <span className="ml-2 text-sm font-normal text-muted-foreground">({employees.length})</span>
          </CardTitle>
          <CardDescription className="mt-0.5">Vue d&apos;ensemble des employés</CardDescription>
        </div>
        {currentUserRole === "admin" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSyncing}
            className="cursor-pointer w-full sm:w-auto"
            onClick={() =>
              startSyncTransition(async () => {
                await onSyncFromLdap();
              })
            }
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {isSyncing ? "Synchronisation…" : "Sync Active Directory"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <EmployeesFilters departments={departments} />
        <DataTable columns={columns} data={paginatedEmployees} />

        {totalItems > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Afficher</span>
              <Select
                value={String(itemsPerPage)}
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <span>par page</span>
            </div>

            <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
              <p className="text-xs text-muted-foreground">
                Affichage de {totalItems === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, totalItems)} sur {totalItems} employé
                {totalItems > 1 ? "s" : ""}
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage > 1) {
                          setCurrentPage((page) => page - 1);
                        }
                      }}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        isActive={page === currentPage}
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(page);
                        }}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage < totalPages) {
                          setCurrentPage((page) => page + 1);
                        }
                      }}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
