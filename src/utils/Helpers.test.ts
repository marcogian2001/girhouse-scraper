import { describe, expect, it } from 'vitest';
import { routing } from '@/libs/I18nRouting';
import { createOrganizationSlug, getI18nPath } from './Helpers';

describe('Helpers', () => {
  describe('I18n path helper', () => {
    it('keeps path unchanged when locale is default', () => {
      const url = '/random-url';
      const locale = routing.defaultLocale;

      expect(getI18nPath(url, locale)).toBe(url);
    });

    it('prefixes path with locale when locale is not default', () => {
      const url = '/random-url';
      const locale = 'it';

      expect(getI18nPath(url, locale)).toBe(`/it${url}`);
    });
  });

  describe('Organization slug', () => {
    it('hyphenates and lowercases the name before the suffix', () => {
      expect(createOrganizationSlug('Acme Srl & Co.')).toMatch(/^acme-srl-co-[0-9a-f]{8}$/u);
    });

    it('strips accents from the name', () => {
      expect(createOrganizationSlug('Caffè Città')).toMatch(/^caffe-citta-[0-9a-f]{8}$/u);
    });

    it('falls back to the suffix alone for a name without letters or digits', () => {
      expect(createOrganizationSlug('!!!')).toMatch(/^[0-9a-f]{8}$/u);
    });

    it('gives two organizations with the same name different slugs', () => {
      expect(createOrganizationSlug('Acme')).not.toBe(createOrganizationSlug('Acme'));
    });
  });
});
