import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { AppConfig } from '@/utils/AppConfig';
import { routing } from './I18nRouting';

export default getRequestConfig(async ({ requestLocale }) => {
  // Typically corresponds to the `[locale]` segment
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    // Dates and times read as in Italy wherever the server runs, Vercel included
    timeZone: AppConfig.timeZone,
    // oxlint-disable-next-line unicorn/no-await-expression-member
    messages: (await import(`../locales/${locale}.json`)).default,
  };
});
