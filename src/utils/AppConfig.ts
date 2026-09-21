import type { LocalePrefixMode } from 'next-intl/routing';

/** Locale prefix strategy for next-intl routing. */
const localePrefix: LocalePrefixMode = 'as-needed';

// FIXME: Customize this configuration for your product
/** Centralized application configuration */
export const AppConfig = {
  name: 'Girhouse Scraper',
  // Where calendar months and days start for spend reports, whatever the server runs in
  timeZone: 'Europe/Rome',
  i18n: {
    locales: ['en', 'it'],
    defaultLocale: 'en',
    localePrefix,
  },
};
