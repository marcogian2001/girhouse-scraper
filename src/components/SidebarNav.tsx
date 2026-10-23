'use client';

import {
  BarChart3,
  BookOpen,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquareWarning,
  Search,
  Send,
  SlidersHorizontal,
  Vote,
} from 'lucide-react';
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

  // Icons are component values and the labels need `t`, so the sections are built here.
  // Home has no label: it sits above the sections as the entry point
  const sections = [
    {
      label: null,
      items: [
        {
          href: '/dashboard/',
          label: t('nav_home'),
          icon: LayoutDashboard,
          exact: true,
        },
      ],
    },
    {
      label: t('group_prospecting'),
      items: [
        {
          href: '/dashboard/leads/',
          label: t('nav_leads'),
          icon: Search,
          exact: false,
        },
        {
          href: '/dashboard/coverage/',
          label: t('nav_coverage'),
          icon: MapIcon,
          exact: false,
        },
      ],
    },
    {
      label: t('group_outreach'),
      items: [
        {
          href: '/dashboard/campaigns/',
          label: t('nav_campaigns'),
          icon: Send,
          exact: false,
        },
        {
          href: '/dashboard/tests/',
          label: t('nav_tests'),
          icon: FlaskConical,
          exact: false,
        },
        {
          href: '/dashboard/email-polls/',
          label: t('nav_email_polls'),
          icon: Vote,
          exact: false,
        },
      ],
    },
    {
      label: t('group_conversations'),
      items: [
        {
          href: '/dashboard/replies/',
          label: t('nav_replies'),
          icon: Inbox,
          exact: false,
        },
        {
          href: '/dashboard/metrics/',
          label: t('nav_metrics'),
          icon: BarChart3,
          exact: false,
        },
      ],
    },
    {
      label: t('group_ai_setup'),
      items: [
        {
          href: '/dashboard/automation/',
          label: t('nav_automation'),
          icon: SlidersHorizontal,
          exact: false,
        },
        {
          href: '/dashboard/objections/',
          label: t('nav_objections'),
          icon: MessageSquareWarning,
          exact: false,
        },
        {
          href: '/dashboard/knowledge/',
          label: t('nav_knowledge'),
          icon: BookOpen,
          exact: false,
        },
      ],
    },
  ];

  const current = stripTrailingSlash(props.pathname);

  return sections.map((section) => (
    <SidebarGroup key={section.items[0]?.href}>
      {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}

      <SidebarGroupContent>
        <SidebarMenu>
          {section.items.map((item) => {
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
  ));
};
