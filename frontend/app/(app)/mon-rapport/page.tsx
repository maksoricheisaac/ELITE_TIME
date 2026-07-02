export const dynamic = 'force-dynamic';

import { serverGet } from "@/lib/server-api";
import type { Pointage, Absence, SystemSettings } from "@/types/models";
import { requireNavigationAccessById } from "@/lib/navigation-guard";
import MonRapportClient from "@/features/employee/mon-rapport";

interface MonRapportPageProps {
  searchParams?: Promise<{ from?: string; to?: string }>;
}

function getDayKeyLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function countBusinessDays(start: Date, end: Date) {
  const d = new Date(start);
  let count = 0;
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export default async function MonRapportPage({ searchParams }: MonRapportPageProps) {
  // Page 100% personnelle : jamais de userId externe, toujours l'utilisateur de la session.
  const auth = await requireNavigationAccessById("mon-rapport");
  const sp = (await searchParams) ?? {};

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const defaultFrom = new Date();
  defaultFrom.setDate(today.getDate() - 30);
  defaultFrom.setHours(0, 0, 0, 0);

  const parsedFrom = sp.from ? new Date(sp.from) : defaultFrom;
  const parsedTo = sp.to ? new Date(sp.to) : today;

  const from = Number.isNaN(parsedFrom.getTime()) ? defaultFrom : parsedFrom;
  const to = Number.isNaN(parsedTo.getTime()) ? today : parsedTo;
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const fromStr = getDayKeyLocal(from);
  const toStr = getDayKeyLocal(to);

  const [pointages, settings, absences] = await Promise.all([
    serverGet<Pointage[]>(`/pointages?userId=${auth.user.id}&from=${fromStr}&to=${toStr}`),
    serverGet<SystemSettings>('/settings'),
    serverGet<Absence[]>(`/absences?userId=${auth.user.id}`),
  ]);

  const businessDays = countBusinessDays(from, to);

  return (
    <MonRapportClient
      pointages={pointages ?? []}
      absences={absences ?? []}
      workStartTime={settings?.workStartTime ?? "08:45"}
      businessDays={businessDays}
      resolvedFrom={fromStr}
      resolvedTo={toStr}
      userFirstname={auth.user.firstname ?? ""}
    />
  );
}
