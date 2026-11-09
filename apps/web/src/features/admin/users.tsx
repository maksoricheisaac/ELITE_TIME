"use client"
import { useState, useTransition } from "react";
import { useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNotification } from "@/contexts/notification-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Plus, Edit, Trash2, Search } from "lucide-react";
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
import type { User } from "@/types/models";
import { adminCreateUser, adminDeleteUser, adminUpdateUser } from "@/actions/admin/users";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  adminCreateUserFormSchema,
  adminEditUserFormSchema,
  adminUsersFiltersSchema,
  type AdminCreateUserFormInput,
  type AdminEditUserFormInput,
  type AdminUsersFiltersInput,
} from "@/schemas/admin/forms/users";


interface AdminUsersClientProps {
  users: User[];
}

export default function AdminUsersClient({ users }: AdminUsersClientProps) {
  const { showSuccess, showError } = useNotification();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showLocalOnly, setShowLocalOnly] = useState(false);

  // Formulaires pour création et édition (react-hook-form + Zod)
  const createForm = useForm<AdminCreateUserFormInput>({
    resolver: zodResolver(adminCreateUserFormSchema),
    defaultValues: {
      email: "",
      username: "",
      firstname: "",
      lastname: "",
      role: "employee",
      department: "",
      position: "",
      includeInReports: true,
    },
    mode: "onSubmit",
  });

  const filtersForm = useForm<AdminUsersFiltersInput>({
    resolver: zodResolver(adminUsersFiltersSchema),
    defaultValues: {
      search: "",
      role: "all",
      department: "all",
    },
    mode: "onChange",
  });

  const editForm = useForm<AdminEditUserFormInput>({
    resolver: zodResolver(adminEditUserFormSchema),
    defaultValues: {
      firstname: "",
      lastname: "",
      email: "",
      role: "employee",
      department: "",
      position: "",
      status: "active",
      includeInReports: true,
    },
    mode: "onSubmit",
  });

  const departments = ["Développement", "Commercial", "RH", "Comptabilité", "Direction"];

  // eslint-disable-next-line react-hooks/incompatible-library
  const { search = "", role, department } = filtersForm.watch();
  const normalizedSearch = search.toLowerCase();
  const filterRole = role ?? "all";
  const filterDepartment = department ?? "all";

  const filteredUsers = users.filter((user) => {
    const matchSearch =
      (user.firstname || "").toLowerCase().includes(normalizedSearch) ||
      (user.lastname || "").toLowerCase().includes(normalizedSearch) ||
      (user.email || "").toLowerCase().includes(normalizedSearch);

    const matchRole = filterRole === "all" || user.role === filterRole;
    const matchDepartment = filterDepartment === "all" || user.department === filterDepartment;
    const matchLocal = !showLocalOnly || user.isLocal === true;

    return matchSearch && matchRole && matchDepartment && matchLocal;
  });

  const totalItems = filteredUsers.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / itemsPerPage);
  
  // Note: filteredUsers contient maintenant l'ensemble des utilisateurs déchiffrés (max 1000 par défaut)
  // La pagination se fait toujours en local pour le moment pour supporter les filtres client sur champs déchiffrés
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  const applyZodErrors = <TValues extends Record<string, unknown>>(
    error: z.ZodError<TValues>,
    setError: ReturnType<typeof useForm<TValues>>["setError"],
  ) => {
    error.issues.forEach((issue) => {
      const field = issue.path[0];
      if (!field || typeof field !== "string") return;
      setError(field as Path<TValues>, { type: "manual", message: issue.message });
    });
  };

  const handleAddUser = (values: AdminCreateUserFormInput) => {
    const parsed = adminCreateUserFormSchema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(parsed.error, createForm.setError);
      showError("Veuillez corriger les champs en erreur.");
      return;
    }
    startTransition(async () => {
      try {
        await adminCreateUser({
          email: parsed.data.email,
          username: parsed.data.username,
          firstname: parsed.data.firstname?.trim() || null,
          lastname: parsed.data.lastname?.trim() || null,
          role: parsed.data.role,
          department: parsed.data.department?.trim() || null,
          position: parsed.data.position?.trim() || null,
          includeInReports: parsed.data.includeInReports,
        });
        showSuccess("✅ Utilisateur ajouté avec succès");
        setAddDialogOpen(false);
        createForm.reset();
        router.refresh();
      } catch {
        showError("Impossible d'ajouter l'utilisateur pour le moment.");
      }
    });
  };

  const handleEditUser = (values: AdminEditUserFormInput) => {
    if (!selectedUser) return;
    const parsed = adminEditUserFormSchema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(parsed.error, editForm.setError);
      showError("Veuillez corriger les champs en erreur.");
      return;
    }
    startTransition(async () => {
      try {
        await adminUpdateUser(selectedUser, {
          firstname: parsed.data.firstname?.trim() || null,
          lastname: parsed.data.lastname?.trim() || null,
          email: parsed.data.email?.trim() || null,
          role: parsed.data.role,
          department: parsed.data.department?.trim() || null,
          position: parsed.data.position?.trim() || null,
          status: parsed.data.status,
          includeInReports: parsed.data.includeInReports,
        });
        showSuccess("✅ Utilisateur modifié avec succès");
        setEditDialogOpen(false);
        setSelectedUser(null);
        router.refresh();
      } catch {
        showError("Impossible de modifier l'utilisateur pour le moment.");
      }
    });
  };

  const handleDeleteUser = () => {
    if (!selectedUser) return;
    startTransition(async () => {
      try {
        await adminDeleteUser(selectedUser);
        showSuccess("✅ Utilisateur supprimé");
        setDeleteDialogOpen(false);
        setSelectedUser(null);
        router.refresh();
      } catch {
        showError("Impossible de supprimer cet utilisateur.");
      }
    });
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
      admin: "destructive",
      manager: "default",
      employee: "secondary",
      team_lead: "outline",
    };
    return (
      <Badge variant={variants[role] || "default"} className="capitalize">
        {role}
      </Badge>
    );
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "name",
      header: () => <span>Nom</span>,
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-2 font-medium">
            <span className="text-xl">{user.avatar}</span>
            {user.firstname} {user.lastname}
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      header: () => <span>Email</span>,
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span>{row.original.email}</span>
          {row.original.isLocal && (
            <Badge variant="outline" className="w-fit text-[10px] h-4 px-1">Local</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: () => <span>Rôle</span>,
      cell: ({ row }) => getRoleBadge(row.original.role),
    },
    {
      accessorKey: "department",
      header: () => <span>Service</span>,
      cell: ({ row }) => <span>{row.original.department}</span>,
    },
    {
      accessorKey: "position",
      header: () => <span>Poste</span>,
      cell: ({ row }) => <span>{row.original.position}</span>,
    },
    {
      accessorKey: "status",
      header: () => <span>Statut</span>,
      cell: ({ row }) => {
        const user = row.original;
        return (
          <Badge variant={user.status === "active" ? "default" : "secondary"}>
            {user.status === "active" ? "Actif" : "Inactif"}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: () => <span>Actions</span>,
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex gap-2">
            <Button
              className="cursor-pointer"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedUser(user.id);
                editForm.reset({
                  firstname: user.firstname || "",
                  lastname: user.lastname || "",
                  email: user.email || "",
                  role: user.role,
                  department: user.department || "",
                  position: user.position || "",
                  status:
                    user.status === "active" || user.status === "inactive"
                      ? user.status
                      : "inactive",
                  includeInReports: user.includeInReports ?? true,
                });
                setEditDialogOpen(true);
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              className="cursor-pointer"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedUser(user.id);
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Gestion des utilisateurs</h1>
            <p className="text-muted-foreground">Gérez tous les utilisateurs de l&apos;entreprise</p>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Ajouter un utilisateur
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouvel utilisateur</DialogTitle>
                <DialogDescription>Ajoutez un nouvel utilisateur au système</DialogDescription>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(handleAddUser)} className="space-y-4" noValidate>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
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
                      control={createForm.control}
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

                  <FormField
                    control={createForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" autoComplete="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Identifiant (username)</FormLabel>
                        <FormControl>
                          <Input autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rôle</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee">Employé</SelectItem>
                            <SelectItem value="team_lead">Chef d&apos;équipe</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionnez un service" />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map((dept) => (
                                <SelectItem key={dept} value={dept}>
                                  {dept}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Poste</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="includeInReports"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Inclure dans les rapports</FormLabel>
                          <p className="text-[11px] text-muted-foreground">
                            Si décoché, l&apos;utilisateur n&apos;apparaîtra pas dans les exports PDF/Excel.
                          </p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button className="cursor-pointer" type="submit" disabled={isPending}>
                      Ajouter
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Dialog d'édition */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogTrigger asChild>
            <div style={{ display: 'none' }} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
              <DialogDescription>Modifiez les informations de l&apos;utilisateur sélectionné</DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(handleEditUser)} className="space-y-4" noValidate>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
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
                    control={editForm.control}
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

                <FormField
                  control={editForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rôle</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee">Employé</SelectItem>
                            <SelectItem value="team_lead">Chef d&apos;équipe</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionnez un service" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept} value={dept}>
                                {dept}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Poste</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Statut</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Actif</SelectItem>
                            <SelectItem value="inactive">Inactif</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="includeInReports"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Inclure dans les rapports</FormLabel>
                        <p className="text-[11px] text-muted-foreground">
                          Si décoché, l&apos;utilisateur n&apos;apparaîtra pas dans les exports PDF/Excel.
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button className="cursor-pointer" type="submit" disabled={isPending}>
                    Enregistrer
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Filtres */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Filtres</CardTitle>
            <div className="flex items-center gap-2">
              <label htmlFor="local-only" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Comptes locaux uniquement
              </label>
              <input
                id="local-only"
                type="checkbox"
                checked={showLocalOnly}
                onChange={(e) => {
                  setShowLocalOnly(e.target.checked);
                  setCurrentPage(1);
                }}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Form {...filtersForm}>
              <div className="flex gap-3">
                <FormField
                  control={filtersForm.control}
                  name="search"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recherche</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="search"
                            placeholder="Nom, email..."
                            className="pl-9"
                            value={field.value ?? ""}
                            onChange={(e) => {
                              field.onChange(e);
                              setCurrentPage(1);
                              void filtersForm.trigger("search");
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={filtersForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rôle</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value ?? "all"}
                          onValueChange={(value) => {
                            field.onChange(value);
                            setCurrentPage(1);
                            void filtersForm.trigger("role");
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tous</SelectItem>
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
                <FormField
                  control={filtersForm.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value ?? "all"}
                          onValueChange={(value) => {
                            field.onChange(value);
                            setCurrentPage(1);
                            void filtersForm.trigger("department");
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tous</SelectItem>
                            {departments.map((dept) => (
                              <SelectItem key={dept} value={dept}>
                                {dept}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Table des utilisateurs */}
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Liste des utilisateurs</CardTitle>
              <CardDescription>
                Résultats : {totalItems} sur {users.length} utilisateurs
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Afficher</span>
              <Select
                value={String(itemsPerPage)}
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[72px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <span>/ page</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataTable columns={columns} data={paginatedUsers} />
            {totalItems > 0 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Affichage de {startIndex + 1}-{Math.min(endIndex, totalItems)} sur {totalItems} utilisateur
                  {totalItems > 1 ? "s" : ""}
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage((page) => Math.max(1, page - 1));
                        }}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page: number) => (
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
                          setCurrentPage((page) => Math.min(totalPages, page + 1));
                        }}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alert dialog pour suppression */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous sûr?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. L&apos;utilisateur sera définitivement supprimé du système.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteUser}
                className="bg-destructive text-destructive-foreground"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
