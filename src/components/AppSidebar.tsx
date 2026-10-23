'use client';

import { ChevronsUpDown } from 'lucide-react';
import { OrganizationSwitcher } from '@/components/OrganizationSwitcher';
import { SidebarNav } from '@/components/SidebarNav';
import { SignOutButton } from '@/components/SignOutButton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { usePathname } from '@/libs/I18nNavigation';

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

export const AppSidebar = (props: {
  user: { name: string; email: string };
  organizations: { id: string; name: string }[];
  activeOrganizationId: string | null;
  // Server-rendered by the layout and passed through, see `UsageSummary`
  usageSummary: React.ReactNode;
}) => {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <OrganizationSwitcher
          organizations={props.organizations}
          activeOrganizationId={props.activeOrganizationId}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarNav pathname={pathname} />
      </SidebarContent>

      <SidebarFooter>
        {props.usageSummary}

        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={props.user.email}>
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-muted text-xs font-medium text-foreground">
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
