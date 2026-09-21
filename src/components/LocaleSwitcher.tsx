'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePathname, useRouter } from '@/libs/I18nNavigation';
import { routing } from '@/libs/I18nRouting';

/**
 * Switches the active locale from the dashboard header.
 * @returns A dropdown with one entry per configured locale.
 */
export const LocaleSwitcher = () => {
  const t = useTranslations('LocaleSwitcher');
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  // Static keys, so the message types still check. A locale added to AppConfig
  // without a label here still shows up, under its own code.
  const labels: Record<string, string> = {
    en: t('label_en'),
    it: t('label_it'),
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('change_language')}>
          <Languages />
          <span className="text-xs font-medium uppercase">{locale}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(next) => {
            if (next === locale) {
              return;
            }

            // The query string is preserved so a filtered view survives the switch
            const { search } = window.location;
            router.push(`${pathname}${search}`, { locale: next, scroll: false });
          }}
        >
          {routing.locales.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {labels[option] ?? option.toUpperCase()}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
