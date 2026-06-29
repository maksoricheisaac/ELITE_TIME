"use client";

import { useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { z } from "zod";
import { useNotification } from "@/contexts/notification-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Mail, CalendarDays, Calendar1, CalendarRange, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { adminUpdateSystemSettings } from "@/actions/admin/settings";
import { adminUpdateEmailScheduling } from "@/actions/admin/email-scheduling";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

interface EligibleUser {
  id: string;
  username: string;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  role: string;
}

interface AdminEmailsClientProps {
  emailScheduling: {
    eligibleUsers: EligibleUser[];
    dailyReportMode: "TODAY" | "YESTERDAY";
    timezone: string;
    daily: {
      id: string;
      enabled: boolean;
      hour: number;
      minute: number;
      includePdf: boolean;
      includeExcel: boolean;
      includeCsv: boolean;
      recipientUserIds: string[];
      recipientEmails: string[];
    } | null;
    weekly: {
      id: string;
      enabled: boolean;
      hour: number;
      minute: number;
      weekday: number;
      weekStartDay: number;
      includePdf: boolean;
      includeExcel: boolean;
      includeCsv: boolean;
      recipientUserIds: string[];
      recipientEmails: string[];
    } | null;
    monthly: {
      id: string;
      enabled: boolean;
      hour: number;
      minute: number;
      monthlySendDay: number;
      includePdf: boolean;
      includeExcel: boolean;
      includeCsv: boolean;
      recipientUserIds: string[];
      recipientEmails: string[];
    } | null;
  };
}

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const [hStr, mStr] = value.split(":");
  const hour = Number(hStr);
  const minute = Number(mStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

// ---------------------------------------------------------------------------
// Reusable recipients sub-component
// ---------------------------------------------------------------------------

interface RecipientsProps {
  scope: string;
  eligibleUsers: EligibleUser[];
  selectedIds: Set<string>;
  onToggleId: (id: string, checked: boolean) => void;
  externalEmails: Set<string>;
  emailInput: string;
  onEmailInputChange: (v: string) => void;
  onAddEmail: () => void;
  onRemoveEmail: (email: string) => void;
  onEmailKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

function RecipientsSection({
  scope,
  eligibleUsers,
  selectedIds,
  onToggleId,
  externalEmails,
  emailInput,
  onEmailInputChange,
  onAddEmail,
  onRemoveEmail,
  onEmailKeyDown,
}: RecipientsProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return eligibleUsers;
    return eligibleUsers.filter((u) => {
      const fullName = `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim().toLowerCase();
      return fullName.includes(t) || (u.email ?? "").toLowerCase().includes(t) || u.username.toLowerCase().includes(t);
    });
  }, [eligibleUsers, search]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Destinataires internes <span className="text-muted-foreground">({selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""})</span>
        </Label>
        <Input
          placeholder="Rechercher un employé..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9"
        />
        <ScrollArea className="h-36 rounded-md border bg-muted/20">
          <div className="p-2 space-y-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">Aucun résultat</p>
            ) : (
              filtered.map((u) => (
                <div key={`${scope}-${u.id}`} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 transition-colors">
                  <Checkbox
                    id={`${scope}-recipient-${u.id}`}
                    checked={selectedIds.has(u.id)}
                    onCheckedChange={(v) => onToggleId(u.id, !!v)}
                  />
                  <Label
                    htmlFor={`${scope}-recipient-${u.id}`}
                    className="text-xs truncate cursor-pointer flex-1"
                  >
                    {u.firstname} {u.lastname}
                    <span className="text-muted-foreground ml-1">({u.email})</span>
                  </Label>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-sm font-medium">Emails externes</Label>
        <div className="flex gap-2">
          <Input
            placeholder="email@exemple.com"
            value={emailInput}
            onChange={(e) => onEmailInputChange(e.target.value)}
            onKeyDown={onEmailKeyDown}
            className="h-9 text-sm"
          />
          <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={onAddEmail} type="button">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {externalEmails.size > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {Array.from(externalEmails).map((email) => (
              <Badge key={email} variant="secondary" className="gap-1 pr-1 text-xs">
                {email}
                <button type="button" onClick={() => onRemoveEmail(email)} className="hover:text-destructive ml-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AdminEmailsClient({ emailScheduling }: AdminEmailsClientProps) {
  const { showSuccess, showError } = useNotification();
  const [isPending, startTransition] = useTransition();

  const eligibleUsers = useMemo(() => emailScheduling.eligibleUsers ?? [], [emailScheduling.eligibleUsers]);

  // --- Daily state ---
  const [dailyTime, setDailyTime] = useState(
    emailScheduling.daily ? formatTime(emailScheduling.daily.hour, emailScheduling.daily.minute) : "18:00",
  );
  const [dailyReportMode, setDailyReportMode] = useState<"TODAY" | "YESTERDAY">(
    emailScheduling.dailyReportMode ?? "YESTERDAY",
  );
  const [dailyFormats, setDailyFormats] = useState({
    pdf: emailScheduling.daily?.includePdf ?? true,
    excel: emailScheduling.daily?.includeExcel ?? false,
  });
  const [dailyRecipientIds, setDailyRecipientIds] = useState<Set<string>>(
    new Set(emailScheduling.daily?.recipientUserIds ?? []),
  );
  const [dailyRecipientEmails, setDailyRecipientEmails] = useState<Set<string>>(
    new Set((emailScheduling.daily?.recipientEmails ?? []).map((v) => v.trim()).filter(Boolean)),
  );
  const [dailyEmailInput, setDailyEmailInput] = useState("");

  // --- Weekly state ---
  const [weeklyTime, setWeeklyTime] = useState(
    emailScheduling.weekly ? formatTime(emailScheduling.weekly.hour, emailScheduling.weekly.minute) : "08:00",
  );
  const [weeklyWeekday, setWeeklyWeekday] = useState(emailScheduling.weekly?.weekday ?? 1);
  const [weekStartDay, setWeekStartDay] = useState(emailScheduling.weekly?.weekStartDay ?? 1);
  const [weeklyFormats, setWeeklyFormats] = useState({
    pdf: emailScheduling.weekly?.includePdf ?? true,
    excel: emailScheduling.weekly?.includeExcel ?? false,
  });
  const [weeklyRecipientIds, setWeeklyRecipientIds] = useState<Set<string>>(
    new Set(emailScheduling.weekly?.recipientUserIds ?? []),
  );
  const [weeklyRecipientEmails, setWeeklyRecipientEmails] = useState<Set<string>>(
    new Set((emailScheduling.weekly?.recipientEmails ?? []).map((v) => v.trim()).filter(Boolean)),
  );
  const [weeklyEmailInput, setWeeklyEmailInput] = useState("");

  // --- Monthly state ---
  const [monthlyTime, setMonthlyTime] = useState(
    emailScheduling.monthly ? formatTime(emailScheduling.monthly.hour, emailScheduling.monthly.minute) : "08:00",
  );
  const [monthlySendDay, setMonthlySendDay] = useState(emailScheduling.monthly?.monthlySendDay ?? 1);
  const [monthlyFormats, setMonthlyFormats] = useState({
    pdf: emailScheduling.monthly?.includePdf ?? true,
    excel: emailScheduling.monthly?.includeExcel ?? false,
  });
  const [monthlyRecipientIds, setMonthlyRecipientIds] = useState<Set<string>>(
    new Set(emailScheduling.monthly?.recipientUserIds ?? []),
  );
  const [monthlyRecipientEmails, setMonthlyRecipientEmails] = useState<Set<string>>(
    new Set((emailScheduling.monthly?.recipientEmails ?? []).map((v) => v.trim()).filter(Boolean)),
  );
  const [monthlyEmailInput, setMonthlyEmailInput] = useState("");

  // --- Email helpers ---
  const addExternalEmail = (
    input: string,
    setInput: (v: string) => void,
    setEmails: (fn: (prev: Set<string>) => Set<string>) => void,
  ) => {
    const candidates = input
      .trim()
      .split(/[\s,;]+/g)
      .map((v) => v.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;

    const invalid = candidates.find((v) => !z.string().email().safeParse(v).success);
    if (invalid) {
      showError(`Email invalide : ${invalid}`);
      return;
    }

    setEmails((prev) => {
      const next = new Set(prev);
      for (const email of candidates) next.add(email);
      return next;
    });
    setInput("");
  };

  const removeEmail = (email: string, setEmails: (fn: (prev: Set<string>) => Set<string>) => void) => {
    setEmails((prev) => {
      const next = new Set(prev);
      next.delete(email);
      return next;
    });
  };

  const toggleId = (id: string, checked: boolean, setIds: (fn: (prev: Set<string>) => Set<string>) => void) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // --- Save ---
  const handleSave = () => {
    const dailyHm = parseTime(dailyTime);
    const weeklyHm = parseTime(weeklyTime);
    const monthlyHm = parseTime(monthlyTime);

    if (!dailyHm || !weeklyHm || !monthlyHm) {
      showError("Heure invalide — format HH:MM requis.");
      return;
    }

    startTransition(async () => {
      try {
        await adminUpdateSystemSettings({ dailyReportMode });
        await adminUpdateEmailScheduling({
          daily: {
            hour: dailyHm.hour,
            minute: dailyHm.minute,
            includePdf: dailyFormats.pdf,
            includeExcel: dailyFormats.excel,
            includeCsv: false,
            recipientUserIds: Array.from(dailyRecipientIds),
            recipientEmails: Array.from(dailyRecipientEmails),
          },
          weekly: {
            hour: weeklyHm.hour,
            minute: weeklyHm.minute,
            weekday: weeklyWeekday,
            weekStartDay,
            includePdf: weeklyFormats.pdf,
            includeExcel: weeklyFormats.excel,
            includeCsv: false,
            recipientUserIds: Array.from(weeklyRecipientIds),
            recipientEmails: Array.from(weeklyRecipientEmails),
          },
          monthly: {
            hour: monthlyHm.hour,
            minute: monthlyHm.minute,
            monthlySendDay,
            includePdf: monthlyFormats.pdf,
            includeExcel: monthlyFormats.excel,
            includeCsv: false,
            recipientUserIds: Array.from(monthlyRecipientIds),
            recipientEmails: Array.from(monthlyRecipientEmails),
          },
        });
        showSuccess("Paramètres email enregistrés avec succès.");
      } catch {
        showError("Impossible d'enregistrer les paramètres email. Veuillez réessayer.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Emails</h1>
          <p className="text-muted-foreground mt-1">
            Configurez l&apos;envoi automatique des rapports de pointage
          </p>
        </div>
        <Button onClick={handleSave} disabled={isPending} className="shrink-0">
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Mail className="h-4 w-4 mr-2" />
          )}
          {isPending ? "Enregistrement..." : "Enregistrer les modifications"}
        </Button>
      </div>

      {/* Timezone info */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 border rounded-lg px-4 py-2.5">
        <CalendarRange className="h-4 w-4 shrink-0" />
        <span>
          Fuseau horaire actif&nbsp;: <strong>{emailScheduling.timezone}</strong>
          &nbsp;— Les plages de dates des rapports sont calculées dans ce fuseau.
        </span>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="daily" className="gap-2">
            <Calendar1 className="h-4 w-4" />
            Journalier
          </TabsTrigger>
          <TabsTrigger value="weekly" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            Hebdomadaire
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-2">
            <CalendarRange className="h-4 w-4" />
            Mensuel
          </TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {/* DAILY TAB                                                         */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="daily">
          <Card className="border-t-4 border-t-blue-500">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar1 className="h-5 w-5 text-blue-500" />
                <div>
                  <CardTitle>Rapport quotidien</CardTitle>
                  <CardDescription>Envoi automatique chaque jour à l&apos;heure configurée</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left column: settings */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Mode de rapport</Label>
                    <Select
                      value={dailyReportMode}
                      onValueChange={(v) => setDailyReportMode(v as "TODAY" | "YESTERDAY")}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="YESTERDAY">Journée précédente (J−1)</SelectItem>
                        <SelectItem value="TODAY">Journée en cours (J)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {dailyReportMode === "YESTERDAY"
                        ? "Le rapport envoyé ce matin couvre la journée d'hier."
                        : "Le rapport envoyé couvre la journée en cours."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Heure d&apos;envoi</Label>
                    <Input
                      type="time"
                      value={dailyTime}
                      onChange={(e) => setDailyTime(e.target.value)}
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Formats joints</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={dailyFormats.pdf}
                          onCheckedChange={(v) => setDailyFormats((prev) => ({ ...prev, pdf: !!v }))}
                        />
                        PDF
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={dailyFormats.excel}
                          onCheckedChange={(v) => setDailyFormats((prev) => ({ ...prev, excel: !!v }))}
                        />
                        Excel
                      </label>
                    </div>
                  </div>
                </div>

                {/* Right column: recipients */}
                <RecipientsSection
                  scope="daily"
                  eligibleUsers={eligibleUsers}
                  selectedIds={dailyRecipientIds}
                  onToggleId={(id, checked) => toggleId(id, checked, setDailyRecipientIds)}
                  externalEmails={dailyRecipientEmails}
                  emailInput={dailyEmailInput}
                  onEmailInputChange={setDailyEmailInput}
                  onAddEmail={() => addExternalEmail(dailyEmailInput, setDailyEmailInput, setDailyRecipientEmails)}
                  onRemoveEmail={(email) => removeEmail(email, setDailyRecipientEmails)}
                  onEmailKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExternalEmail(dailyEmailInput, setDailyEmailInput, setDailyRecipientEmails);
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* WEEKLY TAB                                                        */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="weekly">
          <Card className="border-t-4 border-t-green-500">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-green-500" />
                <div>
                  <CardTitle>Rapport hebdomadaire</CardTitle>
                  <CardDescription>Envoi automatique une fois par semaine</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left column: settings */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Jour d&apos;envoi</Label>
                      <Select
                        value={String(weeklyWeekday)}
                        onValueChange={(v) => setWeeklyWeekday(Number(v))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Heure d&apos;envoi</Label>
                      <Input
                        type="time"
                        value={weeklyTime}
                        onChange={(e) => setWeeklyTime(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Premier jour de la semaine de rapport</Label>
                    <Select
                      value={String(weekStartDay)}
                      onValueChange={(v) => setWeekStartDay(Number(v))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Définit le début de la période couverte par le rapport (ex&nbsp;: lundi → lundi–dimanche).
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Formats joints</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={weeklyFormats.pdf}
                          onCheckedChange={(v) => setWeeklyFormats((prev) => ({ ...prev, pdf: !!v }))}
                        />
                        PDF
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={weeklyFormats.excel}
                          onCheckedChange={(v) => setWeeklyFormats((prev) => ({ ...prev, excel: !!v }))}
                        />
                        Excel
                      </label>
                    </div>
                  </div>
                </div>

                {/* Right column: recipients */}
                <RecipientsSection
                  scope="weekly"
                  eligibleUsers={eligibleUsers}
                  selectedIds={weeklyRecipientIds}
                  onToggleId={(id, checked) => toggleId(id, checked, setWeeklyRecipientIds)}
                  externalEmails={weeklyRecipientEmails}
                  emailInput={weeklyEmailInput}
                  onEmailInputChange={setWeeklyEmailInput}
                  onAddEmail={() => addExternalEmail(weeklyEmailInput, setWeeklyEmailInput, setWeeklyRecipientEmails)}
                  onRemoveEmail={(email) => removeEmail(email, setWeeklyRecipientEmails)}
                  onEmailKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExternalEmail(weeklyEmailInput, setWeeklyEmailInput, setWeeklyRecipientEmails);
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* MONTHLY TAB                                                       */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="monthly">
          <Card className="border-t-4 border-t-purple-500">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-purple-500" />
                <div>
                  <CardTitle>Rapport mensuel</CardTitle>
                  <CardDescription>Envoi automatique une fois par mois — couvre le mois précédent</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left column: settings */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Jour d&apos;envoi dans le mois</Label>
                      <Select
                        value={String(monthlySendDay)}
                        onValueChange={(v) => setMonthlySendDay(Number(v))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                            <SelectItem key={d} value={String(d)}>
                              {d === 1 ? "1er" : `${d}e`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Limité au 28 pour éviter les mois courts. Si le jour est absent (fév.), le dernier jour du mois est utilisé.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Heure d&apos;envoi</Label>
                      <Input
                        type="time"
                        value={monthlyTime}
                        onChange={(e) => setMonthlyTime(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Formats joints</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={monthlyFormats.pdf}
                          onCheckedChange={(v) => setMonthlyFormats((prev) => ({ ...prev, pdf: !!v }))}
                        />
                        PDF
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={monthlyFormats.excel}
                          onCheckedChange={(v) => setMonthlyFormats((prev) => ({ ...prev, excel: !!v }))}
                        />
                        Excel
                      </label>
                    </div>
                  </div>
                </div>

                {/* Right column: recipients */}
                <RecipientsSection
                  scope="monthly"
                  eligibleUsers={eligibleUsers}
                  selectedIds={monthlyRecipientIds}
                  onToggleId={(id, checked) => toggleId(id, checked, setMonthlyRecipientIds)}
                  externalEmails={monthlyRecipientEmails}
                  emailInput={monthlyEmailInput}
                  onEmailInputChange={setMonthlyEmailInput}
                  onAddEmail={() => addExternalEmail(monthlyEmailInput, setMonthlyEmailInput, setMonthlyRecipientEmails)}
                  onRemoveEmail={(email) => removeEmail(email, setMonthlyRecipientEmails)}
                  onEmailKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExternalEmail(monthlyEmailInput, setMonthlyEmailInput, setMonthlyRecipientEmails);
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
