"use client";

import { useMemo, useState, useTransition } from "react";
import type { User, Absence } from "@/types/models";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useNotification } from "@/contexts/notification-context";
import {
  approveAbsence,
  rejectAbsence,
  createManagedLeave,
  updateManagedLeave,
  deleteManagedLeave,
} from "@/actions/manager/absences";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarRange, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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

interface LeaveManagementClientProps {
  team: User[];
  absences: (Absence & {
    user: Pick<User, "id" | "firstname" | "lastname" | "department" | "position">;
  })[];
}

export default function LeaveManagementClient({ team, absences }: LeaveManagementClientProps) {
  const { showSuccess, showError } = useNotification();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const [newLeaveUserId, setNewLeaveUserId] = useState<string>("");
  const [newLeaveStart, setNewLeaveStart] = useState<Date | undefined>();
  const [newLeaveEnd, setNewLeaveEnd] = useState<Date | undefined>();
  const [newLeaveReason, setNewLeaveReason] = useState<string>("");

  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [editLeaveStart, setEditLeaveStart] = useState<Date | undefined>();
  const [editLeaveEnd, setEditLeaveEnd] = useState<Date | undefined>();
  const [editLeaveReason, setEditLeaveReason] = useState<string>("");

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const resetEditState = () => {
    setEditingLeaveId(null);
    setEditLeaveStart(undefined);
    setEditLeaveEnd(undefined);
    setEditLeaveReason("");
  };

  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          team
            .map((e) => e.department)
            .filter((d): d is string => Boolean(d)),
        ),
      ),
    [team],
  );

  const leaveStats = useMemo(() => {
    const total = absences.length;
    let approved = 0;
    let rejected = 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);
    let activeToday = 0;

    const leavesPerDepartment: Record<string, number> = {};

    for (const absence of absences) {
      if (absence.status === "approved") approved += 1;
      else if (absence.status === "rejected") rejected += 1;

      const start = new Date(absence.startDate as unknown as string);
      const end = new Date(absence.endDate as unknown as string);
      if (start <= todayEnd && end >= todayStart) {
        activeToday += 1;
      }

      const dept = absence.user.department || "Non renseigné";
      leavesPerDepartment[dept] = (leavesPerDepartment[dept] ?? 0) + 1;
    }

    const departmentsWithLeaves = Object.keys(leavesPerDepartment).length;

    let topDepartment: string | null = null;
    let topDepartmentCount = 0;

    for (const [dept, count] of Object.entries(leavesPerDepartment)) {
      if (count > topDepartmentCount) {
        topDepartment = dept;
        topDepartmentCount = count;
      }
    }

    return {
      total,
      approved,
      rejected,
      activeToday,
      departmentsWithLeaves,
      topDepartment,
      topDepartmentCount,
    };
  }, [absences]);

  const filteredAbsences = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return absences.filter((absence) => {
      const employee = absence.user;
      const fullName = `${employee.firstname || ""} ${employee.lastname || ""}`.toLowerCase();

      const matchesSearch = term ? fullName.includes(term) : true;

      const matchesStatus =
        statusFilter === "all" || absence.status === statusFilter;

      const matchesDepartment =
        departmentFilter === "all" || employee.department === departmentFilter;

      return matchesSearch && matchesStatus && matchesDepartment;
    });
  }, [absences, searchTerm, statusFilter, departmentFilter]);

  const editingLeave = useMemo(
    () => filteredAbsences.find((a) => a.id === editingLeaveId) ?? null,
    [filteredAbsences, editingLeaveId],
  );

  const columns: ColumnDef<(typeof filteredAbsences)[number]>[] = [
    {
      accessorKey: "employee",
      header: () => <span>Employé</span>,
      cell: ({ row }) => {
        const a = row.original;
        const employee = a.user;
        return (
          <div className="flex flex-col">
            <span className="font-medium">
              {employee.firstname} {employee.lastname}
            </span>
            <span className="text-xs text-muted-foreground">{employee.department}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "dates",
      header: () => <span>Dates</span>,
      cell: ({ row }) => {
        const a = row.original;
        const start = new Date(a.startDate as unknown as string).toLocaleDateString("fr-FR");
        const end = new Date(a.endDate as unknown as string).toLocaleDateString("fr-FR");
        return (
          <span>
            {start} → {end}
          </span>
        );
      },
    },
    {
      accessorKey: "reason",
      header: () => <span>Raison</span>,
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.reason}</span>,
    },
    {
      accessorKey: "status",
      header: () => <span>Statut</span>,
      cell: ({ row }) => {
        const status = row.original.status;
        let label = "En attente";
        let variant: "default" | "secondary" | "outline" | "destructive" = "secondary";

        if (status === "approved") {
          label = "Approuvé";
          variant = "default";
        } else if (status === "rejected") {
          label = "Rejeté";
          variant = "destructive";
        }

        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      cell: ({ row }) => {
        const a = row.original;
        const isPendingStatus = a.status === "pending";

        const handleApprove = () => {
          startTransition(async () => {
            try {
              await approveAbsence(a.id);
              showSuccess("Congé approuvé");
            } catch (error) {
              console.error(error);
              showError("Impossible d'approuver ce congé pour le moment.");
            }
          });
        };

        const handleReject = () => {
          const comment = window.prompt("Motif du rejet (optionnel)") ?? undefined;
          startTransition(async () => {
            try {
              await rejectAbsence(a.id, comment);
              showSuccess("Congé rejeté");
            } catch (error) {
              console.error(error);
              showError("Impossible de rejeter ce congé pour le moment.");
            }
          });
        };

        const handleEdit = () => {
          setEditingLeaveId(a.id);
          setEditLeaveStart(new Date(a.startDate as unknown as string));
          setEditLeaveEnd(new Date(a.endDate as unknown as string));
          setEditLeaveReason(a.reason);
          setIsEditDialogOpen(true);
        };

        const handleDelete = () => {
          startTransition(async () => {
            try {
              await deleteManagedLeave(a.id);
              showSuccess("Congé supprimé");
            } catch (error) {
              console.error(error);
              showError("Impossible de supprimer ce congé pour le moment.");
            }
          });
        };

        return (
          <div className="flex justify-end gap-2">
            {isPendingStatus && (
              <>
                <Button
                  className="cursor-pointer"
                  variant="outline"
                  size="sm"
                  onClick={handleReject}
                  disabled={isPending}
                >
                  Rejeter
                </Button>
                <Button
                  className="cursor-pointer"
                  size="sm"
                  onClick={handleApprove}
                  disabled={isPending}
                >
                  Approuver
                </Button>
              </>
            )}
            <Button
              className="cursor-pointer"
              variant="outline"
              size="sm"
              onClick={handleEdit}
              disabled={isPending}
            >
              Modifier
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="cursor-pointer"
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                >
                  Supprimer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer ce congé ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible. Le congé sera définitivement supprimé et ne sera plus pris en compte
                    dans les rapports.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={isPending}>
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ];

  const handleCreateLeave = () => {
    if (!newLeaveUserId || !newLeaveStart || !newLeaveEnd || !newLeaveReason.trim()) {
      showError("Veuillez renseigner tous les champs du congé.");
      return;
    }

    const start = newLeaveStart;
    const end = newLeaveEnd;

    if (!start || !end || end < start) {
      showError("Période de congé invalide.");
      return;
    }

    const hasOverlappingLeave = absences.some((absence) => {
      if (absence.user.id !== newLeaveUserId) return false;
      if (absence.status === "rejected") return false;

      const existingStart = new Date(absence.startDate as unknown as string);
      const existingEnd = new Date(absence.endDate as unknown as string);

      return existingStart <= end && existingEnd >= start;
    });

    if (hasOverlappingLeave) {
      showError(
        "Cet employé a déjà un congé qui chevauche cette période. Modifiez le congé existant plutôt que d'en créer un nouveau.",
      );
      return;
    }

    startTransition(async () => {
      try {
        await createManagedLeave({
          userId: newLeaveUserId,
          startDate: start,
          endDate: end,
          reason: newLeaveReason.trim(),
        });
        setNewLeaveReason("");
        setNewLeaveStart(undefined);
        setNewLeaveEnd(undefined);
        showSuccess("Congé créé et approuvé.");
        setIsCreateDialogOpen(false);
      } catch (error) {
        console.error(error);
        if (error instanceof Error && error.message.includes("chevauche")) {
          showError(error.message);
        } else {
          showError("Impossible de créer ce congé pour le moment.");
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Gestion des congés
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Congés de l&apos;équipe</h1>
        <p className="text-sm text-muted-foreground">
          Créez et validez les congés de vos collaborateurs. Les congés approuvés seront pris en compte dans les
          pointages et les rapports.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total congés</CardTitle>
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leaveStats.total}</div>
            <p className="text-xs text-muted-foreground">Toutes les demandes enregistrées</p>
          </CardContent>
        </Card>

        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Congés par département</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leaveStats.departmentsWithLeaves}</div>
            <p className="text-xs text-muted-foreground">
              {leaveStats.departmentsWithLeaves === 0
                ? "Aucun département avec des congés"
                : leaveStats.topDepartment
                  ? `Top : ${leaveStats.topDepartment} (${leaveStats.topDepartmentCount} congés)`
                  : "Répartition des congés par département"}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approuvés</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{leaveStats.approved}</div>
            <p className="text-xs text-muted-foreground">Congés validés</p>
          </CardContent>
        </Card>

        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En cours aujourd&apos;hui</CardTitle>
            <AlertCircle className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-600">{leaveStats.activeToday}</div>
            <p className="text-xs text-muted-foreground">Employés actuellement en congé</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un congé</DialogTitle>
            <DialogDescription>
              Renseignez les informations du congé à créer pour l&apos;employé sélectionné.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Ligne 1 : Employé */}
            <div className="space-y-2">
              <Label>Employé</Label>
              <Select value={newLeaveUserId} onValueChange={setNewLeaveUserId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionner un employé" />
                </SelectTrigger>
                <SelectContent>
                  {team.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.firstname} {employee.lastname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ligne 2 : Dates début / fin */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Début</Label>
                <DatePicker
                  value={newLeaveStart}
                  onChange={setNewLeaveStart}
                  placeholder="Date de début"
                />
              </div>

              <div className="space-y-2">
                <Label>Fin</Label>
                <DatePicker
                  value={newLeaveEnd}
                  onChange={setNewLeaveEnd}
                  placeholder="Date de fin"
                />
              </div>
            </div>

            {/* Ligne 3 : Raison */}
            <div className="space-y-2">
              <Label>Raison</Label>
              <Textarea
                placeholder="Ex : Congé annuel, raison familiale, etc."
                value={newLeaveReason}
                onChange={(e) => setNewLeaveReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleCreateLeave}
              disabled={isPending}
            >
              Créer le congé
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Liste des congés</CardTitle>
            <CardDescription>Filtrez et validez les demandes de congés de l&apos;équipe.</CardDescription>
          </div>
          <Button
              type="button"
              className="cursor-pointer"
              size="sm"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              Ajouter un congé
            </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Rechercher un employé</Label>
              <Input
                placeholder="Nom, prénom"
                className="w-full lg:w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Filtrer par statut</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full lg:w-40">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="approved">Approuvés</SelectItem>
                  <SelectItem value="rejected">Rejetés</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {departments.length > 1 && (
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Filtrer par département</Label>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="w-full lg:w-48">
                    <SelectValue placeholder="Département" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les départements</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DataTable columns={columns} data={filteredAbsences} />

          {editingLeave && (
            <Dialog
              open={isEditDialogOpen}
              onOpenChange={(open) => {
                setIsEditDialogOpen(open);
                if (!open) {
                  resetEditState();
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Modifier le congé</DialogTitle>
                  <DialogDescription>
                    {editingLeave.user.firstname} {editingLeave.user.lastname} - du{" "}
                    {new Date(editingLeave.startDate as unknown as string).toLocaleDateString("fr-FR")} au{" "}
                    {new Date(editingLeave.endDate as unknown as string).toLocaleDateString("fr-FR")}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Début</Label>
                    <DatePicker
                      value={editLeaveStart}
                      onChange={setEditLeaveStart}
                      placeholder="Date de début"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fin</Label>
                    <DatePicker
                      value={editLeaveEnd}
                      onChange={setEditLeaveEnd}
                      placeholder="Date de fin"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Raison</Label>
                    <Input
                      placeholder="Mettre à jour la raison"
                      value={editLeaveReason}
                      onChange={(e) => setEditLeaveReason(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      resetEditState();
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    className="cursor-pointer"
                    disabled={isPending}
                    onClick={() => {
                      if (!editingLeaveId || !editLeaveStart || !editLeaveEnd || !editLeaveReason.trim()) {
                        showError("Veuillez renseigner toutes les informations du congé.");
                        return;
                      }

                      if (editLeaveEnd < editLeaveStart) {
                        showError("Période de congé invalide.");
                        return;
                      }

                      startTransition(async () => {
                        try {
                          await updateManagedLeave({
                            id: editingLeaveId,
                            startDate: editLeaveStart,
                            endDate: editLeaveEnd,
                            reason: editLeaveReason.trim(),
                          });
                          showSuccess("Congé mis à jour.");
                          setIsEditDialogOpen(false);
                          resetEditState();
                        } catch (error) {
                          console.error(error);
                          showError("Impossible de mettre à jour ce congé pour le moment.");
                        }
                      });
                    }}
                  >
                    Enregistrer les modifications
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
