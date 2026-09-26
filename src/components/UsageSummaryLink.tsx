'use client';

import { Coins } from 'lucide-react';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { Link } from '@/libs/I18nNavigation';

/**
 * Sidebar button linking to the usage report, wrapping the server-rendered summary.
 * The link is created here, on the client: `asChild` needs a real element, and the
 * server `Link` of next-intl reaches the client as a lazy chunk that `Slot` rejects.
 * @param props Component props.
 * @param props.tooltip The label shown when the sidebar is collapsed.
 * @param props.children The summary rows.
 * @returns A sidebar menu button, reduced to an icon with a tooltip when collapsed.
 */
export const UsageSummaryLink = (props: { tooltip: string; children: React.ReactNode }) => (
  <SidebarMenuButton asChild tooltip={props.tooltip} className="h-auto items-start">
    <Link href="/dashboard/usage/">
      <Coins className="mt-0.5" />
      {props.children}
    </Link>
  </SidebarMenuButton>
);
