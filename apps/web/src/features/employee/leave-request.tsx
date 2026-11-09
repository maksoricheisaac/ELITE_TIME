"use client";

import { useMemo, useState, useTransition } from "react";
import type { Absence, AbsenceType } from "@/types/models";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useNotification } from "@/contexts/notification-context";
import { requestEmployeeAbsence, cancelOwnAbsence } from "@/actions/employee/absences";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { CreateAbsenceSchema } from "@/schemas/employee/absences";
import { CalendarRange, Clock3, CheckCircle2, XCircle } from "lucide-react";
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

interface MyLeavesClientProps {
  absences: Absence[];
}

const TYPE_LABELS: Record<AbsenceType, string> = {
  conge: "Congé payé",
  maladie: "Maladie",
  autre: "Autre",
};

export default function MyLeavesClient({ absences }: MyLeavesClientProps) {
  const { showSuccess, showError } = useNotification();
  const [isPending, startTransition] = useTransition();

  const [type, setType] = useState<AbsenceType>("conge");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");

  const stats = useMemo(() => {
    const pending = absences.filter((a) => a.status === "pending").length;
    const approved = absences.filter((a) => a.status === "approved").length;
    const rejected = absences.filter((a) => a.status === "rejected").length;
    const cancelled = absences.filter((a) => a.status === "cancelled").length;
    return { total: absences.length, pending, approved, rejected, cancelled };
  }, [absences]);

  const sortedAbsences = useMemo(
    () =>
      [...absences].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      ),
    [absences],
  );

  const handleSubmit = () => {
    if (!startDate || !endDate) {
      showError("Veuillez renseigner les dates de début et de fin.");
      return;
    }

    const parsed = CreateAbsenceSchema.safeParse({
      type,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      reason: reason.trim(),
    });

    if (!parsed.success) {
      showError(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
      return;
    }

    if (endDate < startDate) {
      showError("La date de fin doit être postérieure ou égale à la date de début.");
      return;
    }

    startTransition(async () => {
      try {
        await requestEmployeeAbsence(parsed.data);
        showSuccess("Votre demande de congé a été envoyée.");
        setStartDate(undefined);
        setEndDate(undefined);
        setReason("");
        setType("conge");
      } catch (error) {
        console.error(error);
        showError(
          error instanceof Error ? error.message : "Impossible d'envoyer cette demande pour le moment.",
        );
      }
    });
  };

  const handleCancel = (id: string) => {
    startTransition(async () => {
      try {
        await cancelOwnAbsence(id);
        showSuccess("Demande annulée.");
      } catch (error) {
        console.error(error);
        showError("Impossible d'annuler cette demande pour le moment.");
      }
    });
  };

  const columns: ColumnDef<Absence>[] = [
    {
      accessorKey: "type",
      header: () => <span>Type</span>,
      cell: ({ row }) => <span>{TYPE_LABELS[row.original.type]}</span>,
    },
    {
      accessorKey: "dates",
      header: () => <span>Dates</span>,
      cell: ({ row }) => {
        const a = row.original;
        const start = new Date(a.startDate).toLocaleDateString("fr-FR");
        const end = new Date(a.endDate).toLocaleDateString("fr-FR");
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
        if (a.status !== "pending") return null;
        return (
          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="cursor-pointer" variant="outline" size="sm" disabled={isPending}>
                  Annuler
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Annuler cette demande ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    La demande sera marquée comme annulée et n&apos;apparaîtra plus comme active. Cette action ne
                    peut pas être annulée par vous-même une fois confirmée.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Retour</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleCancel(a.id)} disabled={isPending}>
                    Annuler la demande
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Mes congés
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Mes demandes de congé</h1>
        <p className="text-sm text-muted-foreground">
          Demandez un congé et suivez le statut de vos demandes.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Clock3 className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approuvés</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejetés</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.rejected}</div>
          </CardContent>
        </Card>
        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Annulées</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{stats.cancelled}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle demande</CardTitle>
          <CardDescription>Renseignez les informations de votre demande de congé.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AbsenceType)}>
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
            <div className="space-y-2">
              <Label>Début</Label>
              <DatePicker value={startDate} onChange={setStartDate} placeholder="Date de début" />
            </div>
            <div className="space-y-2">
              <Label>Fin</Label>
              <DatePicker value={endDate} onChange={setEndDate} placeholder="Date de fin" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Raison</Label>
            <Textarea
              placeholder="Ex : Congé annuel, raison familiale, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" className="cursor-pointer" onClick={handleSubmit} disabled={isPending}>
              Envoyer la demande
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique de mes demandes</CardTitle>
          <CardDescription>Consultez le statut de vos demandes de congé.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={sortedAbsences} />
        </CardContent>
      </Card>
    </div>
  );
}
