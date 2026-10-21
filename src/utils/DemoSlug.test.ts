import { describe, expect, it } from 'vitest';
import { createDemoSlug, pickFreeDemoSlug } from './DemoSlug';

describe('DemoSlug', () => {
  describe(createDemoSlug, () => {
    it('turns the business name into a slug', () => {
      expect(createDemoSlug('Pizzeria Da Mario')).toBe('pizzeria-da-mario');
    });

    it('falls back to a fixed slug for a name with no letters', () => {
      expect(createDemoSlug('***')).toBe('demo');
    });

    it('keeps long names short', () => {
      expect(createDemoSlug('A'.repeat(100))).toHaveLength(60);
    });

    it('cuts a long name between words', () => {
      expect(createDemoSlug(`Studio ${'Nutrizionista '.repeat(5)}Roma`)).toBe(
        'studio-nutrizionista-nutrizionista-nutrizionista',
      );
    });

    it('keeps a name of a few words whole', () => {
      expect(createDemoSlug('Dott.ssa Anastasia Mulè - Nutrizionista Roma')).toBe(
        'dott-ssa-anastasia-mule-nutrizionista-roma',
      );
    });
  });

  describe(pickFreeDemoSlug, () => {
    it('keeps the base when no demo has it', () => {
      expect(pickFreeDemoSlug('bar-roma', new Set(['bar-roma-centro']))).toBe('bar-roma');
    });

    it('numbers a business with the same name as another', () => {
      expect(pickFreeDemoSlug('bar-roma', new Set(['bar-roma']))).toBe('bar-roma-2');
    });

    it('skips the numbers already taken', () => {
      expect(pickFreeDemoSlug('bar-roma', new Set(['bar-roma', 'bar-roma-2', 'bar-roma-3']))).toBe(
        'bar-roma-4',
      );
    });
  });
});
