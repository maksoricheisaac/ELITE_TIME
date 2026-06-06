'use client';

import { memo, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { navigationRegistry, type NavigationItem } from '@/lib/navigation-registry';
import logo from '@public/logo/logo.png';
import Image from 'next/image';

/**
 * Sidebar 100% permission-driven.
 * Aucune logique de rôle — seules les permissions backend font foi.
 */
export const AdminSidebar = memo(() => {
  const { has, loading, refetch } = useUserPermissions();
  const pathname = usePathname();

  const shouldShowMenuItem = useCallback((item: NavigationItem): boolean => {
    if (loading) return false;
    if (item.hiddenFromSidebar) return false;
    // Masquer si l'utilisateur a un accès supérieur (ex : vue équipe remplace vue self)
    if (item.excludeWhenHasAny?.some((p) => has(p))) return false;
    const required = item.requiredPermissions ?? [];
    if (required.length === 0) return true;
    return required.some((p) => has(p));
  }, [loading, has]);

  const registryItems = useMemo(
    () => navigationRegistry.flatMap((group) => group.items),
    []
  );

  const currentMenu = useMemo(() => {
    const filtered = registryItems.filter((item) => shouldShowMenuItem(item));
    const uniqueMap = new Map<string, NavigationItem>();
    for (const item of filtered) {
      if (!uniqueMap.has(item.to)) uniqueMap.set(item.to, item);
    }
    return Array.from(uniqueMap.values());
  }, [registryItems, shouldShowMenuItem]);

  const activePath = useMemo(() => {
    let active = '';
    for (const item of currentMenu) {
      const matches = pathname === item.to || pathname.startsWith(item.to + '/');
      if (!matches) continue;
      if (!active || item.to.length > active.length) active = item.to;
    }
    return active;
  }, [currentMenu, pathname]);

  useEffect(() => {
    (window as unknown as { refetchPermissions?: () => void | Promise<void> }).refetchPermissions = refetch;
    return () => {
      delete (window as unknown as { refetchPermissions?: () => void | Promise<void> }).refetchPermissions;
    };
  }, [refetch]);

  return (
    <Sidebar collapsible="icon" className="bg-[var(--sidebar)] dark:bg-[var(--sidebar)] border-r border-white/10">
      <SidebarHeader className="h-28 flex items-center justify-center">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link
                prefetch={false}
                href="/dashboard"
                className="flex items-center justify-center w-full h-full"
              >
                <div className="flex items-center justify-center h-full transition-all duration-200 group-data-[collapsible=icon]:h-10">
                  <Image
                    src={logo}
                    alt="logo"
                    width={120}
                    height={120}
                    className="object-contain transition-all duration-200 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:h-8"
                  />
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2 px-1">
              {currentMenu.length > 0 ? (
                currentMenu.map((mi) => {
                  const Icon = mi.icon;
                  const isActive = mi.to === activePath || (!activePath && pathname === mi.to);
                  return (
                    <SidebarMenuItem key={mi.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className={
                          `rounded-lg transition-all duration-150 ease-out ` +
                          (isActive
                            ? 'bg-white/20 text-white shadow-sm'
                            : 'text-white/70 hover:bg-white/10 hover:text-white')
                        }
                      >
                        <Link
                          prefetch={false}
                          href={mi.to}
                          aria-current={isActive ? 'page' : undefined}
                          className="flex w-full items-center gap-3 px-3 py-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0"
                        >
                          {isActive && (
                            <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0 group-data-[collapsible=icon]:hidden" />
                          )}
                          <Icon
                            className={`h-4 w-4 shrink-0 transition-transform duration-150 group-data-[collapsible=icon]:mx-auto ${
                              isActive ? 'text-white' : 'text-white/70'
                            }`}
                          />
                          <span className="truncate group-data-[collapsible=icon]:hidden text-sm font-medium">
                            {mi.label}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-sm text-white/50">
                  {loading ? 'Chargement...' : 'Aucun menu disponible'}
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
});

AdminSidebar.displayName = 'AdminSidebar';

export default AdminSidebar;
