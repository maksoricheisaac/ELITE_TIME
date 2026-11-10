export const dynamic = 'force-dynamic';

import type { User, Permission } from '@/types/models';
import { requireNavigationAccessById } from '@/lib/navigation-guard';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { PermissionsManager } from '@/components/admin/permissions-manager';
import { PageHeader } from '@/components/ui/page-header';
import { serverGet } from '@/lib/server-api';
import { PermissionsTree } from '@/components/admin/permissions-tree';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from "@/components/ui/stat-card";

type PermissionWithMeta = Permission & {
  module?: string | null;
  action?: string | null;
  riskLevel?: string;
  isSystem?: boolean;
};

async function getPageData() {
  await requireNavigationAccessById('permissions');

  const { users: rawUsers } = await serverGet<{ users: User[]; total: number }>('/users?status=active');
  const sortedUsers = [...rawUsers].sort((a, b) => (a.username ?? '').localeCompare(b.username ?? ''));

  const usersWithPermissions = await Promise.all(
    sortedUsers.map(async (user: User) => {
      const userPermissions = await serverGet<{ id: string; permissionId: string; permission: Permission }[]>(
        `/permissions/user/${user.id}`
      );
      return { ...user, userPermissions };
    })
  );

  const permissions = await serverGet<PermissionWithMeta[]>('/permissions');

  return { users: usersWithPermissions, permissions };
}

export default async function PermissionsPage() {
  const { users, permissions } = await getPageData();

  const modules = new Set(permissions.map((p) => p.module ?? p.category));
  const criticalCount = permissions.filter((p) => p.riskLevel === 'CRITICAL').length;
  const highCount = permissions.filter((p) => p.riskLevel === 'HIGH').length;

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Permissions"
        title="Gestion des permissions"
        description="Attribuez des permissions granulaires aux utilisateurs. Format module.action — 115 permissions actives."
      >
        <Button variant="outline" size="sm" asChild className="cursor-pointer">
          <Link href="/permissions-guide">
            <HelpCircle className="h-4 w-4" />
            Guide
          </Link>
        </Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Utilisateurs actifs" value={users.length} />
        <StatCard label="Modules" value={modules.size} hint={`${permissions.length} permissions`} />
        <StatCard
          label="Niveau élevé"
          value={highCount}
          tone={highCount > 0 ? "warning" : "neutral"}
          toneLabel="HIGH"
          hint="permissions à surveiller"
        />
        <StatCard
          label="Niveau critique"
          value={criticalCount}
          tone={criticalCount > 0 ? "danger" : "neutral"}
          toneLabel="CRITICAL"
          hint="permissions sensibles"
        />
      </div>

      {/* Onglets : Attribution | Référentiel */}
      <Tabs defaultValue="attribution">
        <TabsList>
          <TabsTrigger value="attribution">Attribution par utilisateur</TabsTrigger>
          <TabsTrigger value="referentiel">Référentiel des permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="attribution" className="mt-4">
          <PermissionsManager users={users} permissions={permissions} />
        </TabsContent>

        <TabsContent value="referentiel" className="mt-4">
          <PermissionsTree permissions={permissions as Parameters<typeof PermissionsTree>[0]['permissions']} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
