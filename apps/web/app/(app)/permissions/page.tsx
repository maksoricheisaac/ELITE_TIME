export const dynamic = 'force-dynamic';

import type { User, Permission } from '@/types/models';
import { requireNavigationAccessById } from '@/lib/navigation-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Users, Layers, HelpCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { PermissionsManager } from '@/components/admin/permissions-manager';
import { PageHeader } from '@/components/ui/page-header';
import { serverGet } from '@/lib/server-api';
import { PermissionsTree } from '@/components/admin/permissions-tree';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilisateurs actifs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Modules</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{modules.size}</div>
            <p className="text-xs text-muted-foreground mt-0.5">{permissions.length} permissions</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">Élevé</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{highCount}</div>
            <p className="text-xs text-muted-foreground mt-0.5">permissions HIGH</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">Critique</CardTitle>
            <Shield className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{criticalCount}</div>
            <p className="text-xs text-muted-foreground mt-0.5">permissions CRITICAL</p>
          </CardContent>
        </Card>
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
