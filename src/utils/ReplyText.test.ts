import { describe, expect, it } from 'vitest';
import { normalizeForMatching, stripQuotedReply } from './ReplyText';

describe('ReplyText', () => {
  describe('Quoted reply', () => {
    it('drops the quoted thread after an Italian header', () => {
      const reply =
        'Sì, mi interessa.\n\nIl giorno lun 6 ott 2026 alle 10:00 Marco ha scritto:\n> Ciao Luca';

      expect(stripQuotedReply(reply)).toBe('Sì, mi interessa.');
    });

    it('drops lines quoted with a chevron', () => {
      expect(stripQuotedReply('Quanto costa?\n> Ti scrivo perché')).toBe('Quanto costa?');
    });

    it('drops the mobile signature banner', () => {
      expect(stripQuotedReply('Ok\nInviato da iPhone')).toBe('Ok');
    });

    it('keeps a reply without quotes intact', () => {
      expect(stripQuotedReply('  Non ora, grazie.  ')).toBe('Non ora, grazie.');
    });
  });

  describe('Normalisation', () => {
    it('removes accents and extra spaces', () => {
      expect(normalizeForMatching('Non  scrivetemi PIÙ')).toBe('non scrivetemi piu');
    });
  });
});
