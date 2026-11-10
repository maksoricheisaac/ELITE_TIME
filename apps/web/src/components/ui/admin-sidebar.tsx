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
import { useAuth } from '@/contexts/auth-context';
import { navigationRegistry, type NavigationItem } from '@/lib/navigation-registry';
import logo from '@public/logo/logo.png';
import Image from 'next/image';
import { useSidebar } from '@/components/ui/sidebar';

/**
 * Sidebar 100% permission-driven.
 * Aucune logique de rôle — seules les permissions backend font foi.
 */
export const AdminSidebar = memo(() => {
  const { has, loading, refetch } = useUserPermissions();
  const { user } = useAuth();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleNavigate = useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);

  const shouldShowMenuItem = useCallback((item: NavigationItem): boolean => {
    if (loading) return false;
    if (item.hiddenFromSidebar) return false;
    // Items réservés à certains rôles (ex : « Mes pointages », « Mon rapport » = employés
    // uniquement ; l'admin ne pointe pas). Même règle que navigation-guard.
    if (item.requiredRoles && (!user || !item.requiredRoles.includes(user.role))) return false;
    // Masquer si l'utilisateur a un accès supérieur (ex : vue équipe remplace vue self)
    if (item.excludeWhenHasAny?.some((p) => has(p))) return false;
    const required = item.requiredPermissions ?? [];
    if (required.length === 0) return true;
    return required.some((p) => has(p));
  }, [loading, has, user]);

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
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="flex h-20 items-center justify-center border-sidebar-border group-data-[collapsible=icon]:h-14">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link
                prefetch={false}
                href="/dashboard"
                onClick={handleNavigate}
                className="flex items-center justify-center w-full h-full"
              >
                <div className="flex h-full items-center justify-center rounded-md group-data-[collapsible=icon]:h-10 dark:bg-white/95 dark:px-2">
                  <Image
                    src={logo}
                    alt="ELITE TIME — tableau de bord"
                    width={96}
                    height={96}
                    priority
                    className="h-16 w-16 object-contain group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
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
            <SidebarMenu className="gap-0.5 px-1">
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
                          `relative min-h-11 rounded-md text-sm transition-colors duration-150 md:min-h-9 ` +
                          (isActive
                            ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-accent-foreground'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground')
                        }
                      >
                        <Link
                          prefetch={false}
                          href={mi.to}
                          onClick={handleNavigate}
                          aria-current={isActive ? 'page' : undefined}
                          className="flex w-full items-center gap-3 px-3 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0"
                        >
                          <Icon
                            className="h-4 w-4 shrink-0 group-data-[collapsible=icon]:mx-auto"
                            aria-hidden="true"
                          />
                          <span className="truncate group-data-[collapsible=icon]:hidden text-sm">
                            {mi.label}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-sm text-muted-foreground">
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
