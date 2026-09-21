'use client';

import { ChevronsUpDown, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BrandMark } from '@/components/BrandMark';
import { SidebarNav } from '@/components/SidebarNav';
import { SignOutButton } from '@/components/SignOutButton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Link, usePathname } from '@/libs/I18nNavigation';
import { AppConfig } from '@/utils/AppConfig';

/**
 * Builds the two-letter monogram shown while no avatar image exists.
 * @param name The account display name, which may be empty.
 * @returns Up to two uppercase initials.
 */
const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

export const AppSidebar = (props: { user: { name: string; email: string } }) => {
  const t = useTranslations('AppSidebar');
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Deliberately not a SidebarMenuButton: that forces every nested svg to
            16px, which would shrink the mark below the menu buttons it sits above */}
        <Link
          href="/dashboard/"
          className="flex items-center gap-2 rounded-md p-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
        >
          <BrandMark className="size-8" />
          <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
            {AppConfig.name}
          </span>
        </Link>

        <Button asChild className="mt-1 group-data-[collapsible=icon]:px-0">
          <Link href="/dashboard/campaigns/new/">
            <Plus />
            <span className="group-data-[collapsible=icon]:hidden">{t('new_campaign')}</span>
          </Link>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarNav pathname={pathname} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={props.user.email}>
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-medium text-primary">
                      {getInitials(props.user.name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-medium">{props.user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {props.user.email}
                    </span>
                  </div>

                  <ChevronsUpDown className="ml-auto group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent side="right" align="end" className="w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                  {props.user.email}
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <SignOutButton />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};
