import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { SidebarNav } from '@/components/SidebarNav';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import messages from '@/locales/en.json';

/**
 * Mounts the nav with the providers its sidebar primitives require.
 * @param pathname The locale-stripped path the router would report.
 * @returns The rendered result.
 */
const renderNav = async (pathname: string) =>
  await render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TooltipProvider>
        <SidebarProvider>
          <SidebarNav pathname={pathname} />
        </SidebarProvider>
      </TooltipProvider>
    </NextIntlClientProvider>,
  );

describe('Sidebar nav', () => {
  describe('Active item', () => {
    it('marks campaigns active on a campaign detail path', async () => {
      await renderNav('/dashboard/campaigns/abc-123');

      const campaigns = page.getByRole('link', { name: messages.AppSidebar.nav_campaigns });

      await expect.element(campaigns).toHaveAttribute('data-active', 'true');
    });

    it('leaves home inactive on a nested dashboard path', async () => {
      await renderNav('/dashboard/campaigns');

      const home = page.getByRole('link', { name: messages.AppSidebar.nav_home });

      await expect.element(home).toHaveAttribute('data-active', 'false');
    });

    it('marks home active on the dashboard root', async () => {
      await renderNav('/dashboard');

      const home = page.getByRole('link', { name: messages.AppSidebar.nav_home });

      await expect.element(home).toHaveAttribute('data-active', 'true');
    });
  });
});
