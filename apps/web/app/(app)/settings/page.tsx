export const dynamic = 'force-dynamic';

import { adminGetSystemSettings } from '@/actions/admin/settings';
import { adminGetEmailScheduling } from '@/actions/admin/email-scheduling';
import AdminSettingsClient from '@/features/admin/settings';
import { requireNavigationAccessById } from '@/lib/navigation-guard';

export default async function AppSettingsPage() {
  await requireNavigationAccessById('settings');

  const settings = await adminGetSystemSettings();
  const emailScheduling = await adminGetEmailScheduling();

  return <AdminSettingsClient initialSettings={settings} emailScheduling={emailScheduling} />;
}
