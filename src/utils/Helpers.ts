import { Env } from '@/libs/Env';
import { routing } from '@/libs/I18nRouting';

/**
 * Resolves the public base URL of the application.
 * @returns The configured public app URL or the local development URL.
 */
export const getBaseUrl = () => {
  if (Env.NEXT_PUBLIC_APP_URL) {
    return Env.NEXT_PUBLIC_APP_URL;
  }

  return 'http://localhost:3000';
};

/**
 * Reads an optional environment variable that a feature cannot run without.
 * @param name The variable name, surfaced in the error message.
 * @param value The value read from `Env`.
 * @returns The value, narrowed to a non-empty string.
 * @throws {Error} When the variable is not configured.
 */
export const requireEnv = (name: string, value: string | undefined) => {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

/**
 * Builds a locale-aware path by prefixing non-default locales.
 * @param url The base application-relative path starting with a slash.
 * @param locale The active locale identifier.
 * @returns The localized path, prefixed when the locale is not the default locale.
 */
export const getI18nPath = (url: string, locale: string) => {
  if (locale === routing.defaultLocale) {
    return url;
  }

  return `/${locale}${url}`;
};

/**
 * Builds a unique URL slug for an organization from its display name.
 * The random suffix keeps two organizations with the same name apart.
 * @param name The organization name.
 * @returns A lowercase, hyphenated slug ending in a short random suffix.
 */
export const createOrganizationSlug = (name: string) => {
  const base = name
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036F]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '');
  const suffix = crypto.randomUUID().slice(0, 8);

  return base ? `${base}-${suffix}` : suffix;
};
