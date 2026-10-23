'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { BrandMark } from '@/components/BrandMark';
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
import { AppConfig } from '@/utils/AppConfig';

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
            {/* Outlined so the workspace reads as a control apart from the nav items below */}
            <SidebarMenuButton
              variant="outline"
              size="lg"
              tooltip={active?.name ?? t('label')}
              className="data-[state=open]:bg-sidebar-accent"
            >
              <BrandMark className="size-8 rounded-md" />

              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{active?.name}</span>
                <span className="truncate text-xs text-muted-foreground">{AppConfig.name}</span>
              </span>

              <ChevronsUpDown className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="bottom"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
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
