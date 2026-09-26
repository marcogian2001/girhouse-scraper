import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { AppSidebar } from '@/components/AppSidebar';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UsageSummary } from '@/components/UsageSummary';
import { auth } from '@/libs/Auth';
import { getUserOrganizations, resolveOrganizationId } from '@/libs/Organization';
import { EMPTY_USAGE_TOTALS, getUsageTotals } from '@/libs/Usage';
import { currentMonthRange } from '@/utils/DateRange';

type DashboardLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/** Matches the cookie the shadcn sidebar writes when it is collapsed. */
const SIDEBAR_COOKIE_NAME = 'sidebar_state';

export async function generateMetadata(props: DashboardLayoutProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'DashboardLayout',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function DashboardLayout(props: DashboardLayoutProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const session = await auth.api.getSession({ headers: requestHeaders });

  const [organizationId, organizations] = session
    ? await Promise.all([
        resolveOrganizationId(session.user.id, session.session.activeOrganizationId),
        getUserOrganizations(session.user.id),
      ])
    : [null, []];

  // Re-read on every `router.refresh()`, so it keeps up while a campaign runs
  const period = currentMonthRange();
  const usageTotals = organizationId
    ? await getUsageTotals({ organizationId, range: period })
    : EMPTY_USAGE_TOTALS;

  // Reading the cookie on the server keeps the collapsed state from flashing open
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== 'false';

  return (
    // Sidebar tooltips render a bare Radix `Tooltip`, which needs this provider
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar
          user={{ name: session?.user.name ?? '', email: session?.user.email ?? '' }}
          organizations={organizations}
          activeOrganizationId={organizationId}
          usageSummary={<UsageSummary period={period} totals={usageTotals} />}
        />

        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-sm">
            <SidebarTrigger />

            <div className="ml-auto flex items-center gap-1">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
          </header>

          <div className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-6xl">{props.children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
