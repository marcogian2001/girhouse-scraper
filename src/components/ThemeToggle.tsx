'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Switches between the light, dark and system themes.
 * @returns A dropdown holding the three theme options.
 */
export const ThemeToggle = () => {
  const t = useTranslations('ThemeToggle');
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('label')}>
          {/* Both icons ship; the theme class decides which one shows, so the
              trigger is correct even before next-themes has resolved */}
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun />
            {t('light')}
          </DropdownMenuRadioItem>

          <DropdownMenuRadioItem value="dark">
            <Moon />
            {t('dark')}
          </DropdownMenuRadioItem>

          <DropdownMenuRadioItem value="system">
            <Monitor />
            {t('system')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
