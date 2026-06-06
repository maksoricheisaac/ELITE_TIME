'use client';

import { memo } from 'react';
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
import logo from '@public/logo/logo.png';
import Image from 'next/image';
import { navigationRegistry, type NavigationItem } from '@/lib/navigation-registry';

type SidebarItem = Pick<NavigationItem, 'to' | 'icon' | 'label'>;

/**
 * Sidebar 100% permission-driven.
 * Aucune logique de rôle — seules les permissions backend font foi.
 * Un item est visible si :
 *   • requiredPermissions absent ou vide → toujours visible (item universel)
 *   • requiredPermissions défini → l'utilisateur doit en avoir AU MOINS UNE
 */
export const DynamicSidebar = memo(() => {
  const { has, loading } = useUserPermissions();
  const pathname = usePathname();

  const registryItems: NavigationItem[] = navigationRegistry.flatMap((g) => g.items);

  const isVisible = (item: NavigationItem): boolean => {
    if (loading) return false;
    if (item.hiddenFromSidebar) return false;
    // Masquer si l'utilisateur a un accès supérieur (ex : vue équipe remplace vue self)
    if (item.excludeWhenHasAny?.some((p) => has(p))) return false;
    const required = item.requiredPermissions ?? [];
    if (required.length === 0) return true;
    return required.some((p) => has(p));
  };

  const currentMenu: SidebarItem[] = registryItems
    .filter(isVisible)
    .map((item) => ({ to: item.to, icon: item.icon, label: item.label }));

  let activePath = '';
  for (const item of currentMenu) {
    const matches = pathname === item.to || pathname.startsWith(item.to + '/');
    if (!matches) continue;
    if (!activePath || item.to.length > activePath.length) activePath = item.to;
  }

  if (loading) {
    return (
      <Sidebar collapsible="icon" className="bg-[var(--sidebar)] dark:bg-[var(--sidebar)] border-r border-white/10">
        <div className="flex items-center justify-center h-16">
          <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon" className="bg-[var(--sidebar)] dark:bg-[var(--sidebar)] border-r border-white/10">
      <SidebarHeader className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link prefetch={false} href="/dashboard" className="flex flex-col items-center py-2">
                <div className="flex items-center justify-center group-data-[collapsible=icon]:size-8">
                  <Image src={logo} alt="logo" width={140} height={140} className="group-data-[collapsible=icon]:w-7 group-data-[collapsible=icon]:h-7" />
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 px-1">
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
                          <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-white/70'}`} />
                          <span className="truncate group-data-[collapsible=icon]:hidden text-sm font-medium">
                            {mi.label}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-sm text-white/50">Aucun menu disponible</div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
});

DynamicSidebar.displayName = 'DynamicSidebar';
