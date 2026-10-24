import { describe, expect, it } from 'vitest';
import { routing } from '@/libs/I18nRouting';
import { createOrganizationSlug, getI18nPath, personNameOrNull, textOrNull } from './Helpers';

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

  describe('Text or null', () => {
    it('keeps a text and drops a blank one', () => {
      expect(textOrNull('Roberta')).toBe('Roberta');
      expect(textOrNull('  ')).toBeNull();
      expect(textOrNull(null)).toBeNull();
    });
  });

  describe('Person name or null', () => {
    it('drops the research notes in parentheses', () => {
      expect(
        personNameOrNull(
          'Timmy CoffeeMaster (public profile name; legal name not independently confirmed)',
        ),
      ).toBe('Timmy CoffeeMaster');
      expect(personNameOrNull('Aurora Quaranta (the supplied name).')).toBe('Aurora Quaranta');
    });

    it('keeps a plain name', () => {
      expect(personNameOrNull('Rossana Wilma Rita Gasbarra')).toBe('Rossana Wilma Rita Gasbarra');
    });

    it('returns null for a sentence about the name', () => {
      expect(
        personNameOrNull('Not established; no full name could be tied to this contact.'),
      ).toBeNull();
      expect(
        personNameOrNull('The supplied name is Carlo Basile, no fuller published name was found'),
      ).toBeNull();
      expect(personNameOrNull('Alessandro; Frida Jeaneth Coen; Derme')).toBeNull();
    });

    it('returns null for a blank name', () => {
      expect(personNameOrNull('  ')).toBeNull();
      expect(personNameOrNull(null)).toBeNull();
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
