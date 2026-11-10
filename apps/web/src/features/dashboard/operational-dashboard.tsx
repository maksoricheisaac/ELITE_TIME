"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { PresenceChart } from "@/components/charts/presence-chart";
import { RetardChart } from "@/components/charts/retard-chart";
import { adminGetDashboardChartData, type DashboardChartData } from "@/actions/admin/dashboard";
import { managerGetDashboardChartData } from "@/actions/manager/dashboard";
import { EmployeeReportDateRangeFilter } from "@/features/manager/employee-report-date-range-filter";

export interface TodayOverview {
  isWorkingDay: boolean;
  workforce: number;
  presentToday: number;
  onLeaveToday: number;
  absentToday: number | null;
  lateToday: number;
  incompleteCount: number;
  pendingLeaves: number;
  pendingCorrections: number;
}

export interface RecentActivityItem {
  id: string;
  action: string;
  details: string;
  type: string;
  timestamp: string;
}

export interface OperationalStats {
  totalUsers: number;
  employees: number;
  managers: number;
  admins: number;
  activeToday: number;
  departments: { name: string; count: number }[];
  today?: TodayOverview;
  recentActivity?: RecentActivityItem[];
}

interface Props {
  stats: OperationalStats;
  /** admin : périmètre entreprise · manager : périmètre équipe */
  variant: "admin" | "manager";
}

const fromISODate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export default function OperationalDashboard({ stats, variant }: Props) {
  const searchParams = useSearchParams();
  const t = stats.today;

  const { from, to, periodLabel } = useMemo(() => {
    const today = new Date();
    const defaultFrom = new Date();
    defaultFrom.setDate(today.getDate() - 30);
    defaultFrom.setHours(0, 0, 0, 0);
    today.setHours(23, 59, 59, 999);
    const f = fromISODate(searchParams?.get("from")) ?? defaultFrom;
    const e = fromISODate(searchParams?.get("to")) ?? today;
    const fl = f.toLocaleDateString("fr-FR");
    const el = e.toLocaleDateString("fr-FR");
    return { from: f, to: e, periodLabel: fl === el ? fl : `${fl} – ${el}` };
  }, [searchParams]);

  // Plage par défaut (30 jours) affichée dans le filtre tant que l'URL n'en précise pas
  const defaultRange = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    return { from: key(start), to: key(end) };
  }, []);

  // Résultat associé à la requête qui l'a produit : « chargement » = résultat périmé
  const requestKey = `${variant}|${from.toISOString()}|${to.toISOString()}`;
  const [result, setResult] = useState<{ key: string; data: DashboardChartData } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Le manager lit son périmètre d'équipe (route dédiée, permission dashboard.view_team)
    const load =
      variant === "admin"
        ? adminGetDashboardChartData(from.toISOString(), to.toISOString())
        : (managerGetDashboardChartData("", from.toISOString(), to.toISOString()) as Promise<DashboardChartData>);
    load
      .then((data) => !cancelled && setResult({ key: requestKey, data }))
      .catch(() => !cancelled && setResult({ key: requestKey, data: { presence: [], retards: [] } }));
    return () => {
      cancelled = true;
    };
  }, [from, to, variant, requestKey]);

  const loading = result?.key !== requestKey;
  const chart = result?.data ?? null;

  const maxDept = Math.max(1, ...stats.departments.map((d) => d.count));
  const scope = variant === "admin" ? "de l'entreprise" : "de votre équipe";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de bord"
        description={`Situation du jour — ${new Date().toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}`}
        actions={<EmployeeReportDateRangeFilter defaultRange={defaultRange} />}
      />

      {t ? (
        <section aria-labelledby="kpi-title" className="space-y-3">
          <h2 id="kpi-title" className="sr-only">
            Indicateurs du jour
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Effectif" value={t.workforce} hint={`${stats.totalUsers} comptes ${scope}`} />
            <StatCard
              label="Présents"
              value={t.presentToday}
              tone="success"
              toneLabel={t.workforce ? `${Math.round((t.presentToday / t.workforce) * 100)} %` : undefined}
              hint={`sur ${t.workforce} collaborateurs`}
              href="/pointages"
            />
            <StatCard
              label="Absents"
              value={t.absentToday ?? "—"}
              hint={t.isWorkingDay ? "Hors congés approuvés" : "Week-end : non calculé"}
              tone={t.absentToday ? "danger" : "neutral"}
              toneLabel={t.absentToday ? "À vérifier" : undefined}
            />
            <StatCard label="En congé" value={t.onLeaveToday} hint="Congés approuvés aujourd'hui" href="/conges" />
            <StatCard
              label="Retards du jour"
              value={t.lateToday}
              tone={t.lateToday ? "warning" : "neutral"}
              toneLabel={t.lateToday ? "Retard" : undefined}
              hint="Pointages signalés en retard"
              href="/pointages"
            />
            <StatCard
              label="Pointages incomplets"
              value={t.incompleteCount}
              tone={t.incompleteCount ? "danger" : "neutral"}
              toneLabel={t.incompleteCount ? "À régulariser" : undefined}
              hint="Sur les 30 derniers jours"
              href="/pointages"
            />
          </div>
        </section>
      ) : null}

      {t && (t.pendingLeaves > 0 || t.pendingCorrections > 0) && (
        <section aria-labelledby="todo-title" className="space-y-3">
          <h2 id="todo-title" className="text-base font-semibold">
            À traiter
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              label="Demandes de congé en attente"
              value={t.pendingLeaves}
              tone={t.pendingLeaves ? "warning" : "neutral"}
              toneLabel={t.pendingLeaves ? "En attente" : undefined}
              hint="Ouvrir la file de validation"
              href="/conges"
            />
            <StatCard
              label="Demandes de correction en attente"
              value={t.pendingCorrections}
              tone={t.pendingCorrections ? "warning" : "neutral"}
              toneLabel={t.pendingCorrections ? "En attente" : undefined}
              hint="Corrections de pointage à valider"
              href="/pointages"
            />
          </div>
        </section>
      )}

      <section aria-labelledby="charts-title" className="space-y-3">
        <h2 id="charts-title" className="sr-only">
          Évolution sur la période
        </h2>
        {loading && (
          <p role="status" className="text-xs text-muted-foreground">
            Chargement des graphiques…
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PresenceChart
              data={chart?.presence ?? []}
              title="Évolution des présences"
              description={`Présents et absents par jour · ${periodLabel}`}
            />
          </div>
          <RetardChart
            data={chart?.retards ?? []}
            title="Retards"
            description={`Retards par jour · ${periodLabel}`}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-3 py-4 shadow-none lg:col-span-2">
          <CardHeader className="px-4">
            <CardTitle className="text-base font-semibold">Répartition par département</CardTitle>
            <CardDescription className="text-xs">
              Collaborateurs actifs par département ({stats.departments.length})
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            {stats.departments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucun département défini.{" "}
                {variant === "admin" && (
                  <Link href="/departements" className="font-medium text-primary underline-offset-2 hover:underline">
                    Créer un département
                  </Link>
                )}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {[...stats.departments]
                  .sort((a, b) => b.count - a.count)
                  .map((d) => (
                    <li key={d.name} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm">
                      <span className="truncate" title={d.name}>
                        {d.name}
                      </span>
                      <span className="h-2 rounded-full bg-muted" aria-hidden="true">
                        <span
                          className="block h-2 rounded-full bg-chart-1"
                          style={{ width: `${(d.count / maxDept) * 100}%` }}
                        />
                      </span>
                      <span className="tabular text-right font-medium">{d.count}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {variant === "admin" && (
          <Card className="gap-3 py-4 shadow-none">
            <CardHeader className="px-4">
              <CardTitle className="text-base font-semibold">Activité récente</CardTitle>
              <CardDescription className="text-xs">Dernières actions enregistrées</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              {!stats.recentActivity?.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Aucune activité récente.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {stats.recentActivity.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                      <span className="min-w-0">
                        <span className="block truncate font-medium" title={a.action}>
                          {a.action}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground" title={a.details}>
                          {a.details}
                        </span>
                      </span>
                      <time
                        dateTime={a.timestamp}
                        className="shrink-0 text-xs text-muted-foreground"
                        title={new Date(a.timestamp).toLocaleString("fr-FR")}
                      >
                        {relativeTime(a.timestamp)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/logs"
                className="mt-3 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Voir le journal complet
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
