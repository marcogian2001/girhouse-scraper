'use client';

import { useTranslations } from 'next-intl';
import { Portal } from 'radix-ui';
import { BrandMark } from '@/components/BrandMark';
import { Spinner } from '@/components/ui/spinner';

/**
 * Full-screen loader shown while the dashboard reloads for another organization.
 * Portalled to the body, so the mobile sidebar sheet it is opened from cannot clip it.
 * @param props The component props.
 * @param props.name The organization being switched to.
 * @returns The overlay, rendered outside the sidebar.
 */
export const OrganizationSwitchOverlay = (props: { name: string }) => {
  const t = useTranslations('OrganizationSwitcher');

  return (
    <Portal.Root>
      <div
        aria-live="polite"
        className="fixed inset-0 z-50 flex animate-in flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm fade-in-0"
      >
        <BrandMark className="size-10" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {t('switching', { name: props.name })}
        </div>
      </div>
    </Portal.Root>
  );
};
