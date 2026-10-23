'use client';

import { useTranslations } from 'next-intl';
import { DASHBOARD_NAV, isNavActive, stripTrailingSlash } from '@/components/DashboardNav';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Link } from '@/libs/I18nNavigation';

export const SidebarNav = (props: { pathname: string }) => {
  const t = useTranslations('AppSidebar');
  const current = stripTrailingSlash(props.pathname);

  return DASHBOARD_NAV.map((section) => (
    <SidebarGroup key={section.items[0].href} className="py-1">
      {section.groupKey && <SidebarGroupLabel>{t(section.groupKey)}</SidebarGroupLabel>}

      <SidebarGroupContent>
        <SidebarMenu>
          {section.items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={isNavActive({ current, href: item.href, exact: item.exact })}
                tooltip={t(item.labelKey)}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{t(item.labelKey)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
};
