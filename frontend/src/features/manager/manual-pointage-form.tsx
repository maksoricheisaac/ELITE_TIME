"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition, useCallback } from "react";
import { useForm, useWatch, Controller, type Control } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { manualPointageFormSchema, type ManualPointageFormValues } from "@/schemas/manager/manual-pointage";
import { managerGetManualPointagesByDateWithSessions, submitManualPointage, deleteExtraPointageSessions } from "@/actions/manager/pointages";
import { useNotification } from "@/contexts/notification-context";
import { useRealtime } from "@/contexts/realtime-context";

// Types pour la navigation
type CellPosition = {
  rowIndex: number;
  field: "entryTime" | "exitTime" | "lateReason" | "earlyExitReason" | "sessionNumber";
};

interface ManualPointageEmployee {
  id: string;
  firstname: string | null;
  lastname: string | null;
  username: string;
  department: string | null;
  position: string | null;
}

// Composant de ligne mémoïsé pour éviter les re-renders
interface EmployeeRowProps {
  employee: ManualPointageEmployee;
  index: number;
  fullName: string;
  isActive: boolean;
  control: Control<ManualPointageFormValues>;
  isLateEntry: (t: string | null | undefined) => boolean;
  checkEarlyExit: (t: string | null | undefined) => boolean;
  setInputRef: (userId: string, field: string, el: HTMLInputElement | null) => void;
  focusCell: (userId: string, field: CellPosition["field"]) => void;
  setActiveUserId: (id: string | null) => void;
  setActiveCell: (pos: CellPosition | null) => void;
  handleKeyDown: (e: React.KeyboardEvent, userId: string, field: CellPosition["field"]) => void;
}

const EmployeeRow = React.memo(function EmployeeRow({
  employee: e,
  index,
  fullName,
  isActive,
  control,
  isLateEntry,
  checkEarlyExit,
  setInputRef,
  focusCell,
  setActiveUserId,
  setActiveCell,
  handleKeyDown,
}: EmployeeRowProps) {
  const entryValue = useWatch({ control, name: `rows.${index}.entryTime` });
  const exitValue = useWatch({ control, name: `rows.${index}.exitTime` });
  const isMultiPointage = useWatch({ control, name: `rows.${index}.isMultiPointage` });
  const isLate = isLateEntry(entryValue);
  const isEarlyExit = checkEarlyExit(exitValue);
  const details = [e.department, e.position].filter(Boolean).join(" • ");

  return (
    <>
      {/* Ligne Session 1 */}
      <tr
        key={`${e.id}-s1`}
        className={isActive ? "bg-primary/5" : "hover:bg-muted/30"}
      >
        {/* Cellule Session / Multi-pointage */}
        <td className="px-3 py-2 align-middle text-center" rowSpan={isMultiPointage ? 2 : 1}>
          <Controller
            control={control}
            name={`rows.${index}.isMultiPointage`}
            render={({ field }) => (
              <div className="flex flex-col items-center gap-1">
                <Switch
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked)}
                  className="scale-75"
                />
                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                  {field.value ? "Multi" : "Solo"}
                </span>
              </div>
            )}
          />
        </td>

        {/* Cellule Employé */}
        <td
          className="px-3 py-2 align-middle cursor-pointer"
          onClick={() => focusCell(e.id, "entryTime")}
          rowSpan={isMultiPointage ? 2 : 1}
        >
          <div className="flex flex-col">
            <span className="font-medium">{fullName}</span>
            <span className="text-xs text-muted-foreground">
              {details ? `${details} • ` : ""}
              {e.username}
            </span>
          </div>
        </td>

        {/* Heure d'entrée 1 */}
        <td className="px-3 py-2 align-middle">
          <Controller
            control={control}
            name={`rows.${index}.entryTime`}
            render={({ field }) => (
              <div className="flex flex-col gap-1">
                {isMultiPointage && <span className="text-[10px] text-muted-foreground uppercase font-bold">Session 1</span>}
                <Input
                  type="time"
                  {...field}
                  value={field.value ?? ""}
                  ref={(el) => setInputRef(e.id, "entryTime", el)}
                  onFocus={() => {
                    setActiveUserId(e.id);
                    setActiveCell({ rowIndex: index, field: "entryTime" });
                  }}
                  onKeyDown={(evt) => handleKeyDown(evt, e.id, "entryTime")}
                  className="cursor-pointer h-8 text-xs"
                />
              </div>
            )}
          />
        </td>

        {/* Heure de sortie 1 */}
        <td className="px-3 py-2 align-middle">
          <Controller
            control={control}
            name={`rows.${index}.exitTime`}
            render={({ field }) => (
              <div className="flex flex-col gap-1">
                {isMultiPointage && <span className="text-[10px] text-muted-foreground uppercase font-bold">Session 1</span>}
                <Input
                  type="time"
                  {...field}
                  value={field.value ?? ""}
                  ref={(el) => setInputRef(e.id, "exitTime", el)}
                  onFocus={() => {
                    setActiveUserId(e.id);
                    setActiveCell({ rowIndex: index, field: "exitTime" });
                  }}
                  onKeyDown={(evt) => handleKeyDown(evt, e.id, "exitTime")}
                  className="cursor-pointer h-8 text-xs"
                />
              </div>
            )}
          />
        </td>

        {/* Raison retard (uniquement session 1) */}
        <td className="px-3 py-2 align-middle">
          <Controller
            control={control}
            name={`rows.${index}.lateReason`}
            render={({ field }) => (
              <div className="flex flex-col gap-1">
                {isMultiPointage && <span className="text-[10px] text-muted-foreground uppercase font-bold">Session 1</span>}
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={isLate ? "Retard..." : "—"}
                  disabled={!isLate}
                  ref={(el) => setInputRef(e.id, "lateReason", el)}
                  onFocus={() => {
                    setActiveUserId(e.id);
                    setActiveCell({ rowIndex: index, field: "lateReason" });
                  }}
                  onKeyDown={(evt) => handleKeyDown(evt, e.id, "lateReason")}
                  className={!isLate ? "opacity-50 cursor-not-allowed h-8 text-xs" : "cursor-pointer h-8 text-xs"}
                />
              </div>
            )}
          />
        </td>

        {/* Raison sortie 1 */}
        <td className="px-3 py-2 align-middle">
          <Controller
            control={control}
            name={`rows.${index}.earlyExitReason`}
            render={({ field }) => (
              <div className="flex flex-col gap-1">
                {isMultiPointage && <span className="text-[10px] text-muted-foreground uppercase font-bold">Session 1</span>}
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={isEarlyExit ? "Sortie..." : "—"}
                  disabled={!isEarlyExit}
                  ref={(el) => setInputRef(e.id, "earlyExitReason", el)}
                  onFocus={() => {
                    setActiveUserId(e.id);
                    setActiveCell({ rowIndex: index, field: "earlyExitReason" });
                  }}
                  onKeyDown={(evt) => handleKeyDown(evt, e.id, "earlyExitReason")}
                  className={!isEarlyExit ? "opacity-50 cursor-not-allowed h-8 text-xs" : "cursor-pointer h-8 text-xs"}
                />
              </div>
            )}
          />
        </td>
      </tr>

      {/* Ligne Session 2 (conditionnelle) */}
      {isMultiPointage && (
        <tr
          key={`${e.id}-s2`}
          className={isActive ? "bg-primary/5 border-t-0" : "hover:bg-muted/30 border-t-0"}
        >
          {/* Heure d'entrée 2 */}
          <td className="px-3 py-2 align-middle">
            <Controller
              control={control}
              name={`rows.${index}.entryTime2`}
              render={({ field }) => (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-primary uppercase font-bold">Session 2</span>
                  <Input
                    type="time"
                    {...field}
                    value={field.value ?? ""}
                    ref={(el) => setInputRef(e.id, "entryTime2", el)}
                    onFocus={() => {
                      setActiveUserId(e.id);
                      setActiveCell({ rowIndex: index, field: "entryTime" });
                    }}
                    className="cursor-pointer h-8 text-xs border-primary/30"
                  />
                </div>
              )}
            />
          </td>

          {/* Heure de sortie 2 */}
          <td className="px-3 py-2 align-middle">
            <Controller
              control={control}
              name={`rows.${index}.exitTime2`}
              render={({ field }) => (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-primary uppercase font-bold">Session 2</span>
                  <Input
                    type="time"
                    {...field}
                    value={field.value ?? ""}
                    ref={(el) => setInputRef(e.id, "exitTime2", el)}
                    onFocus={() => {
                      setActiveUserId(e.id);
                      setActiveCell({ rowIndex: index, field: "exitTime" });
                    }}
                    className="cursor-pointer h-8 text-xs border-primary/30"
                  />
                </div>
              )}
            />
          </td>

          {/* Pas de raison retard pour Session 2 */}
          <td className="px-3 py-2 align-middle">
            <div className="flex flex-col gap-1 opacity-50">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Session 2</span>
              <Input disabled value="—" className="h-8 text-xs bg-muted/20" />
            </div>
          </td>

          {/* Raison sortie 2 */}
          <td className="px-3 py-2 align-middle">
            <Controller
              control={control}
              name={`rows.${index}.earlyExitReason2`}
              render={({ field }) => (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-primary uppercase font-bold">Session 2</span>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Sortie 2..."
                    ref={(el) => setInputRef(e.id, "earlyExitReason2", el)}
                    onFocus={() => {
                      setActiveUserId(e.id);
                      setActiveCell({ rowIndex: index, field: "earlyExitReason" });
                    }}
                    className="cursor-pointer h-8 text-xs border-primary/30"
                  />
                </div>
              )}
            />
          </td>
        </tr>
      )}
    </>
  );
});

interface ManualPointageFormProps {
  managerId: string;
  workStartTime: string;
  workEndTime: string;
  employees: ManualPointageEmployee[];
}

export function ManualPointageForm({ managerId, workStartTime, workEndTime, employees }: ManualPointageFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showSuccess, showError, showWarning } = useNotification();
  const { emitAdminClosure } = useRealtime();
  const [search, setSearch] = useState("");
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [_activeCell, setActiveCell] = useState<CellPosition | null>(null);
  // Compteur incrémenté après chaque save réussi pour forcer le re-fetch des sessions
  const [refreshKey, setRefreshKey] = useState(0);
  // userId → bool : avait une session 2 ET/OU statut "incomplete" lors du dernier chargement
  const originalHasSession2Ref = useRef<Record<string, boolean>>({});
  const originalIncompleteRef = useRef<Record<string, boolean>>({});

  // Refs pour tous les inputs - structurés par userId et field
  const inputRefs = useRef<Record<string, Record<string, HTMLInputElement | null>>>({});

  const isLateEntry = useCallback((entryTime: string | null | undefined) => {
    if (!entryTime) return false;
    const [eh, em] = entryTime.split(":").map(Number);
    const [sh, sm] = workStartTime.split(":").map(Number);
    if ([eh, em, sh, sm].some((v) => Number.isNaN(v))) return false;
    return eh * 60 + em > sh * 60 + sm;
  }, [workStartTime]);

  const isEarlyExit = useCallback((exitTime: string | null | undefined) => {
    if (!exitTime || !workEndTime) return false;
    const [eh, em] = exitTime.split(":").map(Number);
    const [wh, wm] = workEndTime.split(":").map(Number);
    if ([eh, em, wh, wm].some((v) => Number.isNaN(v))) return false;
    // Si l'heure de sortie est avant l'heure de travail prévue (avec une marge de 1 minute)
    return eh * 60 + em < wh * 60 + wm - 1;
  }, [workEndTime]);

  // Fonction pour enregistrer une ref d'input
  const setInputRef = useCallback((userId: string, field: string, el: HTMLInputElement | null) => {
    if (!inputRefs.current[userId]) {
      inputRefs.current[userId] = {};
    }
    inputRefs.current[userId][field] = el;
  }, []);

  // Fonction pour focus une cellule spécifique
  const focusCell = useCallback((userId: string, field: CellPosition["field"]) => {
    const input = inputRefs.current[userId]?.[field];
    if (input) {
      input.focus();
      // Sélectionne tout le texte pour remplacement rapide
      input.select();
      setActiveUserId(userId);
      const index = employees.findIndex(e => e.id === userId);
      setActiveCell({ rowIndex: index, field });
    }
  }, [employees]);

  // Navigation clavier type Excel
  const handleKeyDown = useCallback((
    e: React.KeyboardEvent,
    userId: string,
    field: CellPosition["field"]
  ) => {
    const currentIndex = employees.findIndex(e => e.id === userId);
    if (currentIndex === -1) return;

    const fields: CellPosition["field"][] = ["entryTime", "exitTime", "lateReason", "earlyExitReason"];
    const currentFieldIndex = fields.indexOf(field);

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        if (currentFieldIndex < fields.length - 1) {
          focusCell(userId, fields[currentFieldIndex + 1]);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (currentFieldIndex > 0) {
          focusCell(userId, fields[currentFieldIndex - 1]);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (currentIndex < employees.length - 1) {
          focusCell(employees[currentIndex + 1].id, field);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (currentIndex > 0) {
          focusCell(employees[currentIndex - 1].id, field);
        }
        break;
      case "Enter":
        e.preventDefault();
        // Empêcher la soumission du formulaire avec Enter dans les inputs
        if (currentFieldIndex < fields.length - 1) {
          focusCell(userId, fields[currentFieldIndex + 1]);
        } else if (currentIndex < employees.length - 1) {
          focusCell(employees[currentIndex + 1].id, "entryTime");
        }
        break;
      case "Tab":
        // Laisse le comportement Tab natif mais track la position
        setActiveCell({ rowIndex: currentIndex, field });
        break;
    }
  }, [employees, focusCell]);

  const form = useForm<ManualPointageFormValues>({
    resolver: zodResolver(manualPointageFormSchema),
    defaultValues: {
      date: "",
      rows: employees.map((e) => ({
        userId: e.id,
        entryTime: "",
        exitTime: "",
        lateReason: "",
        earlyExitReason: "",
        sessionNumber: 1,
        isMultiPointage: false,
        entryTime2: "",
        exitTime2: "",
        earlyExitReason2: "",
      })),
    },
    mode: "onSubmit",
  });

  const dateValue = useWatch({ control: form.control, name: "date" });

  const employeesWithIndex = useMemo(() => {
    return employees.map((e, index) => {
      const fullName = `${e.firstname ?? ""} ${e.lastname ?? ""}`.trim() || e.username;
      const haystack = `${fullName} ${e.username}`.trim().toLowerCase();
      return { employee: e, index, fullName, haystack };
    });
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employeesWithIndex;
    return employeesWithIndex.filter((x) => x.haystack.includes(term));
  }, [employeesWithIndex, search]);

  // Ref stable vers les données employés pour éviter les re-renders parasites
  const employeesRef = useRef(employees);
  useEffect(() => { employeesRef.current = employees; }, [employees]);

  useEffect(() => {
    if (!dateValue) return;

    const currentEmployees = employeesRef.current;
    const userIds = currentEmployees.map((e) => e.id);
    const currentEmployeesWithIndex = currentEmployees.map((e, index) => {
      const fullName = `${e.firstname ?? ""} ${e.lastname ?? ""}`.trim() || e.username;
      return { employee: e, index, fullName };
    });

    let canceled = false;
    startTransition(async () => {
      try {
        const existing = await managerGetManualPointagesByDateWithSessions(dateValue, userIds);
        if (canceled) return;

        for (const { employee, index } of currentEmployeesWithIndex) {
          const userSessions = existing
            .filter((p) => p.userId === employee.id)
            .sort((a, b) => a.sessionNumber - b.sessionNumber);
          const s1 = userSessions.find((p) => p.sessionNumber === 1);
          const s2 = userSessions.find((p) => p.sessionNumber === 2);

          // Mémoriser l'état original pour détecter les transitions
          originalHasSession2Ref.current[employee.id] = userSessions.length > 1;
          originalIncompleteRef.current[employee.id] =
            !!s1 && s1.status === "incomplete" && !s1.exitTime;

          form.setValue(`rows.${index}.entryTime`, s1?.entryTime ?? "", { shouldDirty: false });
          form.setValue(`rows.${index}.exitTime`, s1?.exitTime ?? "", { shouldDirty: false });
          form.setValue(`rows.${index}.lateReason`, s1?.lateReason ?? "", { shouldDirty: false });
          form.setValue(`rows.${index}.earlyExitReason`, s1?.earlyExitReason ?? "", { shouldDirty: false });

          form.setValue(`rows.${index}.entryTime2`, s2?.entryTime ?? "", { shouldDirty: false });
          form.setValue(`rows.${index}.exitTime2`, s2?.exitTime ?? "", { shouldDirty: false });
          form.setValue(`rows.${index}.earlyExitReason2`, s2?.earlyExitReason ?? "", { shouldDirty: false });

          form.setValue(`rows.${index}.isMultiPointage`, userSessions.length > 1, { shouldDirty: false });
          form.setValue(`rows.${index}.sessionNumber`, userSessions.length > 1 ? 2 : 1, { shouldDirty: false });
        }
      } catch (err) {
        console.error(err);
      }
    });

    return () => {
      canceled = true;
    };
  // refreshKey déclenche un re-fetch explicite après chaque save réussi
  // dateValue déclenche un re-fetch quand la date change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateValue, refreshKey]);

  const onSubmit = useCallback(async (values: ManualPointageFormValues) => {
    const { date, rows } = values;

    if (!date) {
      showWarning("Veuillez sélectionner une date.");
      return;
    }

    // On filtre les lignes qui ont au moins une heure d'entrée (pour permettre l'ouverture de session)
    const activeRows = rows.filter((row) => row.entryTime || row.entryTime2);

    if (activeRows.length === 0) {
      showWarning(
        "Aucun pointage à enregistrer. Renseignez au moins une heure d'entrée.",
      );
      return;
    }

    startTransition(async () => {
      try {
        // ── Étape 1 : supprimer les sessions > 1 pour les lignes passées en mode solo ──
        for (const row of rows) {
          if (!row.isMultiPointage && originalHasSession2Ref.current[row.userId]) {
            await deleteExtraPointageSessions(managerId, row.userId, date);
          }
        }

        // ── Étape 2 : enregistrer les sessions ──
        for (const row of activeRows) {
          // Session 1
          if (row.entryTime) {
            const formData1 = new FormData();
            formData1.append("managerId", managerId);
            formData1.append("userId", row.userId);
            formData1.append("date", date);
            formData1.append("entryTime", row.entryTime);
            formData1.append("exitTime", row.exitTime ?? "");
            formData1.append("lateReason", row.lateReason ?? "");
            formData1.append("earlyExitReason", row.earlyExitReason ?? "");
            formData1.append("sessionNumber", "1");
            await submitManualPointage(formData1);
          }

          // Session 2 (si multi activé et rempli)
          if (row.isMultiPointage && row.entryTime2) {
            const formData2 = new FormData();
            formData2.append("managerId", managerId);
            formData2.append("userId", row.userId);
            formData2.append("date", date);
            formData2.append("entryTime", row.entryTime2);
            formData2.append("exitTime", row.exitTime2 ?? "");
            formData2.append("lateReason", "");
            formData2.append("earlyExitReason", row.earlyExitReason2 ?? "");
            formData2.append("sessionNumber", "2");
            await submitManualPointage(formData2);
          }
        }

        // ── Étape 3 : notifier l'employé si un pointage incomplet a été clôturé ──
        for (const row of activeRows) {
          if (row.exitTime && row.entryTime && originalIncompleteRef.current[row.userId]) {
            const emp = employees.find((e) => e.id === row.userId);
            if (emp) {
              const fullName = `${emp.firstname ?? ""} ${emp.lastname ?? ""}`.trim() || emp.username;
              emitAdminClosure({
                userId: row.userId,
                userName: fullName,
                date,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }

        showSuccess("Les pointages ont été enregistrés avec succès.");
        setRefreshKey((k) => k + 1);
        router.refresh();
      } catch (error) {
        console.error("Erreur lors de l'enregistrement:", error);
        showError("Une erreur est survenue lors de l'enregistrement des pointages.");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerId, showWarning, showSuccess, showError, startTransition, router]);

  const handleReset = () => {
    form.reset({
      date: "",
      rows: employees.map((e) => ({
        userId: e.id,
        entryTime: "",
        exitTime: "",
        lateReason: "",
        earlyExitReason: "",
        sessionNumber: 1,
        isMultiPointage: false,
        entryTime2: "",
        exitTime2: "",
        earlyExitReason2: "",
      })),
    });
  };

  const handleFormSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void form.handleSubmit(onSubmit)(e);
    },
    [form, onSubmit],
  );

  return (
    <Form {...form}>
      <form className="space-y-4" noValidate onSubmit={handleFormSubmit}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="w-full md:max-w-sm space-y-2">
            <FormLabel>Rechercher un employé</FormLabel>
            <Input
              placeholder="Nom / prénom / username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="w-full md:w-56 space-y-2">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date du pointage</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-center font-medium w-16">Session</th>
                <th className="px-3 py-2 text-left font-medium">Employé</th>
                <th className="px-3 py-2 text-left font-medium">Heure d&apos;entrée</th>
                <th className="px-3 py-2 text-left font-medium">Heure de sortie</th>
                <th className="px-3 py-2 text-left font-medium text-amber-600 dark:text-amber-400">Raison (retard)</th>
                <th className="px-3 py-2 text-left font-medium text-blue-600 dark:text-blue-400">Raison (sortie)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background/80">
              {filteredEmployees.map(({ employee: e, index, fullName }) => {
                const isActive = activeUserId === e.id;

                return (
                  <EmployeeRow
                    key={e.id}
                    employee={e}
                    index={index}
                    fullName={fullName}
                    isActive={isActive}
                    control={form.control}
                    isLateEntry={isLateEntry}
                    checkEarlyExit={isEarlyExit}
                    setInputRef={setInputRef}
                    focusCell={focusCell}
                    setActiveUserId={setActiveUserId}
                    setActiveCell={setActiveCell}
                    handleKeyDown={handleKeyDown}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between gap-2">
          <div className="flex gap-2">
            <Button
              className="cursor-pointer"
              type="button"
              variant="outline"
              onClick={() => router.push("/pointages")}
              disabled={isPending || form.formState.isSubmitting}
            >
              Retour aux pointages
            </Button>
            <Button
              className="cursor-pointer"
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={isPending || form.formState.isSubmitting}
            >
              Réinitialiser les entrées
            </Button>
          </div>
          <Button
            className="cursor-pointer"
            type="submit"
            disabled={isPending || form.formState.isSubmitting}
          >
            {isPending || form.formState.isSubmitting ? "Enregistrement..." : "Enregistrer le pointage"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
