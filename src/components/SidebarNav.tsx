'use client';

import { BookOpen, LayoutDashboard, Search, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Link } from '@/libs/I18nNavigation';

/**
 * Normalizes a path for comparison, since hrefs in this app carry a trailing slash.
 * @param path The path to normalize.
 * @returns The path without any trailing slash, or the root path.
 */
const stripTrailingSlash = (path: string) => path.replace(/\/+$/u, '') || '/';

export const SidebarNav = (props: { pathname: string }) => {
  const t = useTranslations('AppSidebar');

  // Icons are component values and the labels need `t`, so the list is built here
  const items = [
    { href: '/dashboard/', label: t('nav_home'), icon: LayoutDashboard, exact: true },
    { href: '/dashboard/leads/', label: t('nav_leads'), icon: Search, exact: false },
    { href: '/dashboard/campaigns/', label: t('nav_campaigns'), icon: Send, exact: false },
    { href: '/dashboard/knowledge/', label: t('nav_knowledge'), icon: BookOpen, exact: false },
  ];

  const current = stripTrailingSlash(props.pathname);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('group_workspace')}</SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const target = stripTrailingSlash(item.href);
            // Home would otherwise light up on every nested dashboard route
            const isActive = item.exact
              ? current === target
              : current === target || current.startsWith(`${target}/`);

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
