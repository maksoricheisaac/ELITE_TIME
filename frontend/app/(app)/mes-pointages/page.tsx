export const dynamic = 'force-dynamic';

import { requireNavigationAccessById } from "@/lib/navigation-guard";
import { getEmployeeRecentPointages } from "@/actions/employee/pointages";
import EmployeePointagesClient from "@/features/employee/pointages";

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveRange(searchParams?: { from?: string; to?: string }) {
  const fromParam = searchParams?.from;
  const toParam = searchParams?.to;

  const parseLocal = (value: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
    return new Date(value);
  };

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setHours(0, 0, 0, 0);
  today.setHours(23, 59, 59, 999);

  const fromDate = fromParam ? parseLocal(fromParam) : defaultFrom;
  const toDate = toParam ? parseLocal(toParam) : today;

  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(23, 59, 59, 999);

  return { fromDate, toDate };
}

export default async function AppMyPointagesPage(props: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const searchParams = await props.searchParams;
  const auth = await requireNavigationAccessById("mes-pointages");
  const user = auth.user;

  const { fromDate, toDate } = resolveRange(searchParams);
  const resolvedFrom = toISODate(fromDate);
  const resolvedTo = toISODate(toDate);

  const pointages = await getEmployeeRecentPointages(user.id, fromDate, toDate);

  return (
    <EmployeePointagesClient
      pointages={pointages}
      canEdit={false}
      resolvedFrom={resolvedFrom}
      resolvedTo={resolvedTo}
    />
  );
}
