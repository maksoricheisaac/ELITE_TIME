export const dynamic = 'force-dynamic';

import { serverGet } from "@/lib/server-api";
import type { Pointage, Absence, SystemSettings } from "@/types/models";
import { requireNavigationAccessById } from "@/lib/navigation-guard";
import MonRapportClient from "@/features/employee/mon-rapport";
import { addDays, dayKeyOf, isValidDayKey } from "@elitetime/time";
import { BUSINESS_TZ } from "@/lib/period-stats";

interface MonRapportPageProps {
  searchParams?: Promise<{ from?: string; to?: string }>;
}

export default async function MonRapportPage({ searchParams }: MonRapportPageProps) {
  // Page 100% personnelle : jamais de userId externe, toujours l'utilisateur de la session.
  const auth = await requireNavigationAccessById("mon-rapport");
  const sp = (await searchParams) ?? {};

  // Période en JOURS calendaires du fuseau métier (aucune conversion d'instant : pas de décalage possible).
  const todayKey = dayKeyOf(new Date(), BUSINESS_TZ);
  const pick = (v: string | undefined, fallback: string) => {
    const k = (v ?? "").slice(0, 10);
    return isValidDayKey(k) ? k : fallback;
  };
  let fromStr = pick(sp.from, addDays(todayKey, -30));
  let toStr = pick(sp.to, todayKey);
  if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];

  const [pointages, settings, absences] = await Promise.all([
    serverGet<Pointage[]>(`/pointages?userId=${auth.user.id}&from=${fromStr}&to=${toStr}`),
    serverGet<SystemSettings>('/settings'),
    serverGet<Absence[]>(`/absences?userId=${auth.user.id}`),
  ]);

  return (
    <MonRapportClient
      pointages={pointages ?? []}
      absences={absences ?? []}
      workStartTime={settings?.workStartTime ?? "08:45"}
      holidays={(settings as unknown as { holidays?: unknown } | null)?.holidays}
      resolvedFrom={fromStr}
      resolvedTo={toStr}
      userFirstname={auth.user.firstname ?? ""}
    />
  );
}
