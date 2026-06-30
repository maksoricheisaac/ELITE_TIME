
export const dynamic = 'force-dynamic';

import { adminGetEmailScheduling } from '@/actions/admin/email-scheduling';
import { requireNavigationAccessById } from '@/lib/navigation-guard';
import AdminEmailsClient from '@/features/admin/emails';

export default async function AdminEmailsPage() {
  await requireNavigationAccessById('emails');

  const emailScheduling = await adminGetEmailScheduling();

  return <AdminEmailsClient emailScheduling={emailScheduling} />;
}
