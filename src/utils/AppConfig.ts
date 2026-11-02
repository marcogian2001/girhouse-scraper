import type { LocalePrefixMode } from 'next-intl/routing';

/** Locale prefix strategy for next-intl routing. */
const localePrefix: LocalePrefixMode = 'as-needed';

// FIXME: Customize this configuration for your product
/** Centralized application configuration */
export const AppConfig = {
  name: 'Girhouse Scraper',
  // What leads see on the demo pages, without the internal tool's name
  brandName: 'Girhouse',
  // The checkout that activates the first month at the reduced price
  checkoutUrl: 'https://girhouse.com/attiva/',
  // Where calendar months and days start for spend reports, and the hours Instantly sends in
  timeZone: 'Europe/Rome',
  i18n: {
    locales: ['en', 'it'],
    defaultLocale: 'en',
    localePrefix,
  },
};
