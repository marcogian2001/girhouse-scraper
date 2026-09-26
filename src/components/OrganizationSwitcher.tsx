'use client';

import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { OrganizationSwitchOverlay } from '@/components/OrganizationSwitchOverlay';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { organization } from '@/libs/AuthClient';
import { Link, useRouter } from '@/libs/I18nNavigation';

export const OrganizationSwitcher = (props: {
  organizations: { id: string; name: string }[];
  activeOrganizationId: string | null;
}) => {
  const t = useTranslations('OrganizationSwitcher');
  const router = useRouter();
  const [isSwitching, startSwitching] = useTransition();
  const [target, setTarget] = useState('');

  const active = props.organizations.find((item) => item.id === props.activeOrganizationId);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={active?.name ?? t('label')}>
              <Building2 />
              <span className="truncate">{active?.name}</span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="right" align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t('label')}
            </DropdownMenuLabel>

            {props.organizations.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => {
                  if (item.id === props.activeOrganizationId) {
                    return;
                  }

                  setTarget(item.name);
                  // Pending until the new dashboard has rendered, which keeps the overlay up
                  startSwitching(async () => {
                    await organization.setActive({ organizationId: item.id });
                    // The current page may belong to the previous organization
                    router.push('/dashboard/');
                    router.refresh();
                  });
                }}
              >
                <span className="truncate">{item.name}</span>
                {item.id === props.activeOrganizationId && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href="/dashboard/organizations/new/">
                <Plus />
                {t('new_organization')}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      {isSwitching && <OrganizationSwitchOverlay name={target} />}
    </SidebarMenu>
  );
};
