
export const dynamic = 'force-dynamic';

import { adminGetActivityLogsWithEmployees } from '@/actions/admin/logs';
import LogsClient from '@/features/admin/logs';
import { requireNavigationAccessById } from '@/lib/navigation-guard';

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default async function AppLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string; page?: string; type?: string; user?: string }>;
}) {
  await requireNavigationAccessById('logs');

  const params = await searchParams;
  const fromParam = params?.from;
  const toParam = params?.to;
  const today = new Date();

  const resolvedFrom = fromParam ?? toISODate(today);
  const resolvedTo = toParam ?? toISODate(today);

  const page = typeof params?.page === 'string' ? Math.max(1, parseInt(params.page) || 1) : 1;
  const type = params?.type ?? 'all';
  const userId = params?.user ?? 'all';

  const { logs, employees } = await adminGetActivityLogsWithEmployees({
    page,
    limit: 50,
    from: resolvedFrom,
    to: resolvedTo,
    type: type !== 'all' ? type : undefined,
    userId: userId !== 'all' ? userId : undefined,
  });

  return (
    <LogsClient
      logs={logs}
      employees={employees}
      resolvedFrom={resolvedFrom}
      resolvedTo={resolvedTo}
    />
  );
}
