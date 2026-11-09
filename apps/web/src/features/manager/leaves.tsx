"use client";

import { useMemo, useState, useTransition } from "react";
import type { User, Absence, AbsenceType, UserRole } from "@/types/models";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useNotification } from "@/contexts/notification-context";
import { useUserPermissions } from "@/hooks/use-user-permissions";
import {
  approveAbsence,
  rejectAbsence,
  createManagedLeave,
  updateManagedLeave,
  deleteManagedLeave,
  hideManagedLeave,
} from "@/actions/manager/absences";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { CalendarRange, CheckCircle2, AlertCircle, Building2, XCircle } from "lucide-react";
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

const TYPE_LABELS: Record<AbsenceType, string> = {
  conge: "Congé payé",
  maladie: "Maladie",
  autre: "Autre",
};

function computeDurationDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  return Math.round(diffMs / 86400000) + 1;
}

function formatDecisionAuthor(author?: { firstname: string; lastname: string } | null): string {
  if (!author) return "Inconnu";
  const name = `${author.firstname} ${author.lastname}`.trim();
  return name || "Inconnu";
}

interface LeaveManagementClientProps {
  team: User[];
  absences: (Absence & {
    user: Pick<User, "id" | "firstname" | "lastname" | "department" | "position">;
  })[];
  currentUserRole: UserRole;
}

export default function LeaveManagementClient({ team, absences, currentUserRole }: LeaveManagementClientProps) {
  const { showSuccess, showError } = useNotification();
  const { has } = useUserPermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [periodStart, setPeriodStart] = useState<Date | undefined>();
  const [periodEnd, setPeriodEnd] = useState<Date | undefined>();
  const [detailAbsenceId, setDetailAbsenceId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [newLeaveUserId, setNewLeaveUserId] = useState<string>("");
  const [newLeaveType, setNewLeaveType] = useState<AbsenceType>("conge");
  const [newLeaveStart, setNewLeaveStart] = useState<Date | undefined>();
  const [newLeaveEnd, setNewLeaveEnd] = useState<Date | undefined>();
  const [newLeaveReason, setNewLeaveReason] = useState<string>("");

  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [editLeaveStart, setEditLeaveStart] = useState<Date | undefined>();
  const [editLeaveEnd, setEditLeaveEnd] = useState<Date | undefined>();
  const [editLeaveReason, setEditLeaveReason] = useState<string>("");

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [rejectingLeaveId, setRejectingLeaveId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

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
    let cancelled = 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);
    let activeToday = 0;

    const leavesPerDepartment: Record<string, number> = {};

    for (const absence of absences) {
      if (absence.status === "approved") approved += 1;
      else if (absence.status === "rejected") rejected += 1;
      else if (absence.status === "cancelled") cancelled += 1;

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
      cancelled,
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

      const matchesPeriod =
        (!periodStart || new Date(absence.endDate as unknown as string) >= periodStart) &&
        (!periodEnd || new Date(absence.startDate as unknown as string) <= periodEnd);

      return matchesSearch && matchesStatus && matchesDepartment && matchesPeriod;
    });
  }, [absences, searchTerm, statusFilter, departmentFilter, periodStart, periodEnd]);

  const editingLeave = useMemo(
    () => filteredAbsences.find((a) => a.id === editingLeaveId) ?? null,
    [filteredAbsences, editingLeaveId],
  );

  const detailAbsence = useMemo(
    () => filteredAbsences.find((a) => a.id === detailAbsenceId) ?? null,
    [filteredAbsences, detailAbsenceId],
  );

  const columns: ColumnDef<(typeof filteredAbsences)[number]>[] = [
    {
      accessorKey: "employee",
      header: () => <span>Employé</span>,
      cell: ({ row }) => {
        const a = row.original;
        const employee = a.user;
        return (
          <button
            type="button"
            className="flex flex-col text-left hover:underline cursor-pointer"
            onClick={() => setDetailAbsenceId(a.id)}
          >
            <span className="font-medium">
              {employee.firstname} {employee.lastname}
            </span>
            <span className="text-xs text-muted-foreground">{employee.department}</span>
          </button>
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
      id: "duration",
      header: () => <span>Durée</span>,
      cell: ({ row }) => {
        const a = row.original;
        const days = computeDurationDays(
          a.startDate as unknown as string,
          a.endDate as unknown as string,
        );
        return <span className="text-sm">{days} j</span>;
      },
    },
    {
      accessorKey: "reason",
      header: () => <span>Raison</span>,
      meta: { className: "hidden md:table-cell" },
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
        } else if (status === "cancelled") {
          label = "Annulé";
          variant = "outline";
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
        const canActOnNonPending = isPendingStatus || currentUserRole === "admin";

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
          setRejectingLeaveId(a.id);
          setRejectComment("");
          setIsRejectDialogOpen(true);
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
              showSuccess("Congé annulé");
            } catch (error) {
              console.error(error);
              showError("Impossible d'annuler ce congé pour le moment.");
            }
          });
        };

        const handleHide = () => {
          startTransition(async () => {
            try {
              await hideManagedLeave(a.id);
              showSuccess("Congé supprimé de la liste");
            } catch (error) {
              console.error(error);
              showError("Impossible de supprimer ce congé pour le moment.");
            }
          });
        };

        return (
          <div className="flex justify-end gap-2">
            {isPendingStatus && has("absences.reject") && (
              <Button
                className="cursor-pointer"
                variant="outline"
                size="sm"
                onClick={handleReject}
                disabled={isPending}
              >
                Rejeter
              </Button>
            )}
            {isPendingStatus && has("absences.approve") && (
              <Button
                className="cursor-pointer"
                size="sm"
                onClick={handleApprove}
                disabled={isPending}
              >
                Approuver
              </Button>
            )}
            {canActOnNonPending && has("absences.edit_managed") && (
              <Button
                className="cursor-pointer"
                variant="outline"
                size="sm"
                onClick={handleEdit}
                disabled={isPending}
              >
                Modifier
              </Button>
            )}
            {canActOnNonPending && has("absences.delete_managed") && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="cursor-pointer"
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                  >
                    Annuler
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Annuler ce congé ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Ce congé sera marqué comme annulé et ne sera plus pris en compte dans les pointages et les
                      rapports. Cette action peut être tracée dans l&apos;historique.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Retour</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={isPending}>
                      Annuler le congé
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {has("absences.delete_managed") && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="cursor-pointer"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                  >
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce congé de la liste ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette ligne ne sera plus affichée dans la liste des congés. La donnée est conservée en base
                      de données et reste consultable si nécessaire.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Retour</AlertDialogCancel>
                    <AlertDialogAction onClick={handleHide} disabled={isPending}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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
      if (absence.status === "rejected" || absence.status === "cancelled") return false;

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
          type: newLeaveType,
          startDate: start,
          endDate: end,
          reason: newLeaveReason.trim(),
        });
        setNewLeaveReason("");
        setNewLeaveType("conge");
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

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
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

        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Annulés</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{leaveStats.cancelled}</div>
            <p className="text-xs text-muted-foreground">Congés annulés</p>
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

            {/* Ligne 2 : Type */}
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newLeaveType} onValueChange={(v) => setNewLeaveType(v as AbsenceType)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Type de congé" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conge">Congé payé</SelectItem>
                  <SelectItem value="maladie">Maladie</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ligne 3 : Dates début / fin */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            {/* Ligne 4 : Raison */}
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

      <Dialog
        open={isRejectDialogOpen}
        onOpenChange={(open) => {
          setIsRejectDialogOpen(open);
          if (!open) {
            setRejectingLeaveId(null);
            setRejectComment("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter ce congé</DialogTitle>
            <DialogDescription>Vous pouvez indiquer un motif de rejet (optionnel).</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motif du rejet</Label>
            <Textarea
              placeholder="Ex : période trop chargée, chevauchement d'équipe, etc."
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={3}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsRejectDialogOpen(false);
                setRejectingLeaveId(null);
                setRejectComment("");
              }}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                if (!rejectingLeaveId) return;
                const id = rejectingLeaveId;
                startTransition(async () => {
                  try {
                    await rejectAbsence(id, rejectComment.trim() || undefined);
                    showSuccess("Congé rejeté");
                    setIsRejectDialogOpen(false);
                    setRejectingLeaveId(null);
                    setRejectComment("");
                  } catch (error) {
                    console.error(error);
                    showError("Impossible de rejeter ce congé pour le moment.");
                  }
                });
              }}
            >
              Confirmer le rejet
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
          {has("absences.create_managed") && (
            <Button
              type="button"
              className="cursor-pointer"
              size="sm"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              Ajouter un congé
            </Button>
          )}
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
                  <SelectItem value="cancelled">Annulés</SelectItem>
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

            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Période — du</Label>
              <DatePicker value={periodStart} onChange={setPeriodStart} placeholder="Date de début" />
            </div>

            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Période — au</Label>
              <DatePicker value={periodEnd} onChange={setPeriodEnd} placeholder="Date de fin" />
            </div>

            {(searchTerm ||
              statusFilter !== "all" ||
              departmentFilter !== "all" ||
              periodStart ||
              periodEnd) && (
              <div className="space-y-1">
                <Label className="text-sm text-transparent select-none">Réinitialiser</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                    setDepartmentFilter("all");
                    setPeriodStart(undefined);
                    setPeriodEnd(undefined);
                  }}
                >
                  Réinitialiser les filtres
                </Button>
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

      <Sheet
        open={Boolean(detailAbsence)}
        onOpenChange={(open) => {
          if (!open) setDetailAbsenceId(null);
        }}
      >
        <SheetContent>
          {detailAbsence && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {detailAbsence.user.firstname} {detailAbsence.user.lastname}
                </SheetTitle>
                <SheetDescription>{detailAbsence.user.department}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <p className="text-sm">{TYPE_LABELS[detailAbsence.type]}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Période</Label>
                  <p className="text-sm">
                    {new Date(detailAbsence.startDate as unknown as string).toLocaleDateString("fr-FR")} →{" "}
                    {new Date(detailAbsence.endDate as unknown as string).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Durée</Label>
                  <p className="text-sm">
                    {computeDurationDays(
                      detailAbsence.startDate as unknown as string,
                      detailAbsence.endDate as unknown as string,
                    )}{" "}
                    jour(s)
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Statut</Label>
                  <p className="text-sm">
                    {detailAbsence.status === "pending" && "En attente"}
                    {detailAbsence.status === "approved" && "Approuvé"}
                    {detailAbsence.status === "rejected" && "Rejeté"}
                    {detailAbsence.status === "cancelled" && "Annulé"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Raison</Label>
                  <p className="text-sm text-muted-foreground">{detailAbsence.reason}</p>
                </div>
                {detailAbsence.comment && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Commentaire de décision</Label>
                    <p className="text-sm text-muted-foreground">{detailAbsence.comment}</p>
                  </div>
                )}
                {detailAbsence.status === "approved" && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Approuvé par</Label>
                    <p className="text-sm">{formatDecisionAuthor(detailAbsence.approvedBy)}</p>
                  </div>
                )}
                {detailAbsence.status === "rejected" && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Traité par</Label>
                    <p className="text-sm">{formatDecisionAuthor(detailAbsence.rejectedBy)}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
